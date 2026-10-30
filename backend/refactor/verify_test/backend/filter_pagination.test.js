// backend/refactor/verify_test/backend/filter_pagination.test.js
// Nhóm 3: Pagination & Filter Testing
// Chuyên kiểm tra sự trùng khớp về phân trang, sắp xếp (sorting) và các tổ hợp bộ lọc (filter operators & ranges).

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Nạp biến môi trường .env từ thư mục gốc của backend
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { getAppPool } = require('../../../src/config/db');
const strategyMetadataDao = require('../../../src/dao/strategyMetadataDao');

const BASELINE_DIR = path.resolve(__dirname, '../../result_test/baseline');
const LATEST_DIR = path.resolve(__dirname, '../../result_test/latest');

// Tham số cố định dùng cho kiểm thử
const TEST_TABLE = 'backtest_temp1';

// Tạo thư mục nếu chưa tồn tại
fs.mkdirSync(BASELINE_DIR, { recursive: true });
fs.mkdirSync(LATEST_DIR, { recursive: true });

// Loại bỏ các trường động/thời gian để so sánh dữ liệu tĩnh chính xác
function cleanData(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanData);
  }
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      if (['timestamp', 'updatedAt', 'createdAt', 'ageMs', 'time', 'duration', 'generationTime'].includes(key)) {
        cleaned[key] = '[IGNORE]';
      } else {
        cleaned[key] = cleanData(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
}

// So sánh các số thực có dung sai (tolerance) để tránh lỗi làm tròn dấu phẩy động
function assertNumbersClose(actual, expected, path = '') {
  if (typeof actual === 'number' && typeof expected === 'number') {
    const diff = Math.abs(actual - expected);
    assert.ok(diff <= 0.0001, `Lệch số tại [${path}]: mong đợi ${expected}, thực tế ${actual} (lệch ${diff})`);
    return;
  }
  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    assert.strictEqual(actual, expected, `Khác biệt giá trị null/undefined tại [${path}]`);
    return;
  }
  if (typeof actual !== typeof expected) {
    assert.fail(`Khác kiểu dữ liệu tại [${path}]: mong đợi ${typeof expected}, thực tế ${typeof actual}`);
  }
  if (Array.isArray(actual)) {
    assert.strictEqual(actual.length, expected.length, `Độ dài mảng khác biệt tại [${path}]`);
    for (let i = 0; i < actual.length; i++) {
      assertNumbersClose(actual[i], expected[i], `${path}[${i}]`);
    }
    return;
  }
  if (typeof actual === 'object') {
    const keysActual = Object.keys(actual);
    const keysExpected = Object.keys(expected);
    for (const key of keysExpected) {
      assert.ok(keysActual.includes(key), `Thiếu thuộc tính "${key}" tại [${path}]`);
      assertNumbersClose(actual[key], expected[key], path ? `${path}.${key}` : key);
    }
    return;
  }
  assert.strictEqual(actual, expected, `Khác biệt giá trị tĩnh tại [${path}]: mong đợi "${expected}", thực tế "${actual}"`);
}

// Helper thực hiện lưu/đối chiếu snapshot
function verifySnapshot(name, data) {
  const cleaned = cleanData(data);
  const baselinePath = path.join(BASELINE_DIR, `filter_${name}.json`);
  const latestPath = path.join(LATEST_DIR, `filter_${name}.json`);

  if (!fs.existsSync(baselinePath)) {
    fs.writeFileSync(baselinePath, JSON.stringify(cleaned, null, 2), 'utf8');
    console.log(`💾 Đã tạo baseline bộ lọc mới cho: ${name}`);
    return;
  }

  fs.writeFileSync(latestPath, JSON.stringify(cleaned, null, 2), 'utf8');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  assertNumbersClose(cleaned, baseline, name);
  console.log(`✅ Khớp hoàn hảo baseline bộ lọc: ${name}`);
}

test('Nhóm 3: Filter & Pagination - Kiểm thử cấu trúc bộ lọc và phân trang', async (t) => {
  
  // Đóng pool kết nối sau khi test chạy xong
  t.after(() => {
    const pool = getAppPool();
    pool.end();
  });

  await t.test('1. Kiểm tra lọc theo Symbol (đơn & combo nhiều symbols)', async () => {
    // Lọc đơn symbol
    const singleSymbolResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      symbol: 'BTCUSD',
      pageSize: 3,
      page: 1
    });
    verifySnapshot('single_symbol_btcusd', singleSymbolResult);

    // Lọc nhiều symbols (phân tách bằng dấu phẩy)
    const multiSymbolResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      symbol: 'BTCUSD,ETHUSD',
      pageSize: 3,
      page: 1
    });
    verifySnapshot('multi_symbols', multiSymbolResult);
  });

  await t.test('2. Kiểm tra phân trang (page, pageSize)', async () => {
    // Page 2, size 2
    const pagingResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      pageSize: 2,
      page: 2
    });
    verifySnapshot('pagination_page2_size2', pagingResult);
  });

  await t.test('3. Kiểm tra sắp xếp (Sorting theo Profit, Quantity, Winrate)', async () => {
    // Sắp xếp Profit DESC
    const sortProfitResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      sortBy: 'totalNetProfit',
      sortDir: 'desc',
      pageSize: 3
    });
    verifySnapshot('sort_profit_desc', sortProfitResult);

    // Sắp xếp Quantity (Deals) ASC
    const sortQuantityResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      sortBy: 'quantity',
      sortDir: 'asc',
      pageSize: 3
    });
    verifySnapshot('sort_quantity_asc', sortQuantityResult);
  });

  await t.test('4. Kiểm tra các toán tử lọc (Operators: >=, <=)', async () => {
    const operatorResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      profitFactor: 1.5,
      sharpeRatio: 1.0,
      operators: {
        profitFactor: '>=',
        sharpeRatio: '>='
      },
      pageSize: 3
    });
    verifySnapshot('operators_gt_equal', operatorResult);
  });

  await t.test('5. Kiểm tra lọc theo khoảng giá trị (Ranges)', async () => {
    const rangeResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      operators: {
        profitFactor: 'range',
        sharpeRatio: 'range'
      },
      ranges: {
        profitFactor: { min: 1.0, max: 2.5 },
        sharpeRatio: { min: 0.5, max: 2.0 }
      },
      pageSize: 3
    });
    verifySnapshot('ranges_between', rangeResult);
  });

  await t.test('6. Tổ hợp bộ lọc phức tạp (Combo Symbol, TF, Range & Operator)', async () => {
    const comboResult = await strategyMetadataDao.getPagedStrategies({
      backtestTable: TEST_TABLE,
      symbol: 'BTCUSD',
      timeframe: 'H1',
      profitFactor: 1.2,
      operators: {
        profitFactor: '>='
      },
      pageSize: 3
    });
    verifySnapshot('combo_filters', comboResult);
  });
});

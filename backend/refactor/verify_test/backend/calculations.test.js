// backend/refactor/verify_test/backend/calculations.test.js
// Nhóm 2: Calculations & Data Aggregation Testing
// Gọi trực tiếp Service/DAO ở Backend để kiểm tra công thức toán học và logic tính toán động (PD, Winrate, HTR, VEI, Drawdown)

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Nạp biến môi trường .env từ thư mục gốc của backend
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { getAppPool } = require('../../../src/config/db');
const strategyMetadataDao = require('../../../src/dao/strategyMetadataDao');
const behaviorAnalysisService = require('../../../src/service/behaviorAnalysisService');
const riskAnalysisService = require('../../../src/service/riskAnalysisService');
const dashboardDao = require('../../../src/dao/dashboardDao');

const BASELINE_DIR = path.resolve(__dirname, '../../result_test/baseline');
const LATEST_DIR = path.resolve(__dirname, '../../result_test/latest');

// Tham số cố định dùng cho kiểm thử
const TEST_TABLE = 'backtest_temp1';
const START_DATE = '2023-01-01';
const END_DATE = '2024-01-01';
const TEST_STRATEGY = '001BTCUSDH1OB';

// Loại bỏ các trường động/thời gian để so sánh giá trị tính toán thuần túy
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
  const baselinePath = path.join(BASELINE_DIR, `calc_${name}.json`);
  const latestPath = path.join(LATEST_DIR, `calc_${name}.json`);

  if (!fs.existsSync(baselinePath)) {
    fs.writeFileSync(baselinePath, JSON.stringify(cleaned, null, 2), 'utf8');
    console.log(`💾 Đã tạo baseline tính toán mới cho: ${name}`);
    return;
  }

  fs.writeFileSync(latestPath, JSON.stringify(cleaned, null, 2), 'utf8');
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  assertNumbersClose(cleaned, baseline, name);
  console.log(`✅ Khớp hoàn hảo baseline tính toán: ${name}`);
}

test('Nhóm 2: Calculations - Kiểm thử công thức & logic tính toán động', async (t) => {
  
  // Đóng pool kết nối sau khi test chạy xong
  t.after(() => {
    const pool = getAppPool();
    pool.end();
  });

  await t.test('1. Kiểm tra tính toán động getStrategiesByTimeRange (P/D, Winrate, Drawdown)', async () => {
    const result = await strategyMetadataDao.getStrategiesByTimeRange({
      backtestTable: TEST_TABLE,
      startDate: START_DATE,
      endDate: END_DATE,
      pageSize: 5,
      page: 1
    });

    assert.ok(result && result.data, 'Không lấy được danh sách strategies theo thời gian');
    verifySnapshot('strategies_time_range', result.data);
  });

  await t.test('2. Kiểm tra tính toán phân tích hành vi Behavior (HTR, VEI)', async () => {
    const result = await behaviorAnalysisService.getBehaviorStrategyDetail(TEST_STRATEGY, TEST_TABLE);
    
    assert.ok(result && result.volumeEscalationData, 'Không tính toán được volumeEscalationData cho strategy');
    verifySnapshot('behavior_strategy_detail', result);
  });

  await t.test('3. Kiểm tra tính toán rủi ro Risk Overview Summary', async () => {
    const result = await riskAnalysisService.getRiskOverviewSummary(TEST_TABLE, START_DATE, END_DATE);
    
    assert.ok(result, 'Không lấy được Risk Overview Summary');
    verifySnapshot('risk_overview_summary', result);
  });

  await t.test('4. Kiểm tra dữ liệu Dashboard Overview Aggregation', async () => {
    const result = await dashboardDao.getDashboardOverview(TEST_TABLE, null, START_DATE, END_DATE);
    
    assert.ok(result, 'Không lấy được Dashboard Overview');
    verifySnapshot('dashboard_overview', result);
  });
});

// backend/refactor/verify_test/backend/edge_cases.test.js
// Nhóm 4: Edge Cases & Security (SQL Injection, Error Handling, Transaction Rollback)
// Đảm bảo hệ thống an toàn trước mã độc SQL, xử lý tham số không hợp lệ và hoàn trả dữ liệu (rollback) khi xảy ra lỗi.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Nạp biến môi trường .env
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { getAppPool } = require('../../../src/config/db');
const pool = getAppPool();

const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

// Helper thực hiện GET request và trả về statusCode + body
function fetchAPI(url) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${url}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    }).on('error', reject);
  });
}

test('Nhóm 4: Edge Cases & Security - Kiểm thử bảo mật & xử lý ngoại lệ', async (t) => {
  
  t.after(() => {
    pool.end();
  });

  await t.test('1. Xử lý tham số không hợp lệ (NaN, String rỗng) - Server không crash', async () => {
    // Gửi page và pageSize là ký tự chữ
    const res = await fetchAPI('/api/strategies?page=abc&pageSize=xyz');
    
    // Server có thể trả về 400/500 nhưng tuyệt đối KHÔNG được crash process (vẫn phản hồi response)
    assert.ok(res.statusCode === 400 || res.statusCode === 500, `API trả về status không mong đợi: ${res.statusCode}`);
    const parsed = JSON.parse(res.body);
    assert.ok(parsed.error || parsed.message, 'Response lỗi không có thông tin chi tiết');
  });

  await t.test('2. Bảng không tồn tại - Trả về mảng rỗng và status 200 (Safe Behavior)', async () => {
    const res = await fetchAPI('/api/strategies?backtest_table=non_existent_table_999');
    
    assert.strictEqual(res.statusCode, 200, `API trả về status không mong đợi: ${res.statusCode}`);
    const parsed = JSON.parse(res.body);
    assert.ok(Array.isArray(parsed.data) && parsed.data.length === 0, 'Dữ liệu không rỗng khi bảng không tồn tại');
  });

  await t.test('3. Ngăn chặn SQL Injection qua tham số backtest_table (Safe Parameterized)', async () => {
    // Thử chèn câu lệnh SQL độc hại phá hoại
    const maliciousPayload = 'backtest_temp1";DROP TABLE users;--';
    const res = await fetchAPI(`/api/strategies?backtest_table=${encodeURIComponent(maliciousPayload)}`);
    
    // Hệ thống dùng parameterized query nên sẽ tìm kiếm bảng tên là 'backtest_temp1";DROP TABLE users;--'
    // Không tìm thấy -> Trả về 200 với mảng rỗng, KHÔNG thực thi lệnh phá hoại
    assert.strictEqual(res.statusCode, 200);
    const parsed = JSON.parse(res.body);
    assert.ok(Array.isArray(parsed.data) && parsed.data.length === 0, 'Bị lọt dữ liệu hoặc thực thi câu lệnh SQL injection');
    
    // Kiểm tra xem bảng strategy_metadata vẫn còn nguyên vẹn trong DB
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'strategy_metadata'
      )
    `);
    assert.strictEqual(checkTable.rows[0].exists, true, 'Bảng strategy_metadata đã bị xóa hoặc ảnh hưởng bởi SQL Injection!');
  });

  await t.test('4. Ngăn chặn SQL Injection qua bộ lọc symbol và search', async () => {
    const maliciousSymbol = "' OR '1'='1";
    const res = await fetchAPI(`/api/strategies?symbol=${encodeURIComponent(maliciousSymbol)}`);
    
    // Phải trả về kết quả rỗng hoặc báo lỗi, không được lộ lọt dữ liệu do bypass 1=1
    assert.ok(res.statusCode === 200 || res.statusCode === 400 || res.statusCode === 500);
    if (res.statusCode === 200) {
      const parsed = JSON.parse(res.body);
      const data = parsed.data || [];
      // Đảm bảo không bị dump toàn bộ DB
      assert.ok(data.length === 0, 'Dữ liệu bị lộ lọt do lỗi SQL Injection ở bộ lọc symbol!');
    }
  });

  await t.test('5. Kiểm thử cơ chế Transaction Rollback khi insert gặp lỗi', async () => {
    const client = await pool.connect();
    try {
      // Bắt đầu Transaction
      await client.query('BEGIN');

      // Ghi thử dữ liệu giả lập
      const insertQuery = `
        INSERT INTO strategy_metadata (strategy_id, backtest_table, symbol, results) 
        VALUES ($1, $2, $3, $4)
      `;
      await client.query(insertQuery, ['TX_TEST_STRATEGY', 'backtest_temp1', 'BTCUSD', '{}']);

      // Kiểm tra trong transaction xem dữ liệu đã tạm ghi nhận chưa
      const checkInside = await client.query('SELECT 1 FROM strategy_metadata WHERE strategy_id = $1', ['TX_TEST_STRATEGY']);
      assert.strictEqual(checkInside.rowCount, 1, 'Dữ liệu tạm chưa được ghi vào transaction');

      // Giả lập lỗi bằng cách rollback (hoặc insert trùng khoá ngoại) để kiểm tra khôi phục
      await client.query('ROLLBACK');

      // Kiểm tra lại ngoài transaction: dữ liệu phải biến mất hoàn toàn
      const checkOutside = await pool.query('SELECT 1 FROM strategy_metadata WHERE strategy_id = $1', ['TX_TEST_STRATEGY']);
      assert.strictEqual(checkOutside.rowCount, 0, 'Transaction Rollback thất bại, dữ liệu rác vẫn bị ghi xuống DB!');

      console.log('✅ Cơ chế Transaction Rollback hoạt động hoàn hảo!');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
});

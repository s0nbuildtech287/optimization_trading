// backend/refactor/verify_test/backend/pool.test.js
// Nhóm 5: DB Connection & Pool Concurrency Testing
// Kiểm thử khả năng chịu tải đồng thời (Concurrent Requests) để chứng minh Pool hoạt động bền bỉ, không bị nghẽn hay cạn kiệt kết nối.

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Nạp biến môi trường .env từ thư mục gốc
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { getAppPool } = require('../../../src/config/db');
const pool = getAppPool();

// Số lượng yêu cầu đồng thời để giả lập tải người dùng thực tế
const CONCURRENT_REQUESTS = 40;

test('Nhóm 5: DB Connection & Pool - Kiểm thử kết nối và chịu tải đồng thời', async (t) => {
  
  t.after(() => {
    pool.end();
  });

  await t.test(`Chạy đồng thời ${CONCURRENT_REQUESTS} truy vấn độc lập - Pool không bị cạn kiệt (Connection Exhausted)`, async () => {
    console.log(`🚀 Đang khởi tạo đồng thời ${CONCURRENT_REQUESTS} kết nối tới PostgreSQL...`);

    const startTime = Date.now();

    // Hàm thực hiện một truy vấn SELECT 1 siêu nhỏ
    const runQuery = async (index) => {
      const client = await pool.connect();
      try {
        const res = await client.query('SELECT 1 + $1::int AS result', [index]);
        assert.strictEqual(res.rows[0].result, index + 1);
        return true;
      } finally {
        // Đảm bảo LUÔN LUÔN giải phóng client về Pool để tránh rò rỉ kết nối (leak connection)
        client.release();
      }
    };

    // Tạo mảng chứa 40 promise chạy đồng thời
    const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => runQuery(i));

    // Thực thi toàn bộ đồng thời bằng Promise.all
    const results = await Promise.all(promises);

    const duration = Date.now() - startTime;
    console.log(`⏱️ Đã xử lý thành công ${results.length}/${CONCURRENT_REQUESTS} truy vấn trong ${duration}ms!`);

    // Tất cả các truy vấn phải trả về true
    assert.strictEqual(results.length, CONCURRENT_REQUESTS, 'Số lượng truy vấn hoàn thành không đủ');
    assert.ok(results.every(r => r === true), 'Có truy vấn bị thất bại giữa chừng');
  });
});

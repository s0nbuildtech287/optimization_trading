const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { getAppPool } = require('../src/config/db');

async function importData() {
  console.log('🚀 Bắt đầu nạp dữ liệu Production...');

  const sqlFile = path.join(__dirname, '..', 'export_data_production.sql');
  if (!fs.existsSync(sqlFile)) {
    console.error('❌ Không tìm thấy file export_data_production.sql tại thư mục backend!');
    console.error('👉 Vui lòng đảm bảo file export_data_production.sql nằm đúng ở thư mục backend/');
    process.exit(1);
  }

  const stats = fs.statSync(sqlFile);
  console.log(`📦 Đã tìm thấy file SQL: export_data_production.sql (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  const pool = getAppPool();
  const client = await pool.connect();

  console.log('⏳ Đang nạp file SQL vào Database Production theo dạng Stream Batch...');

  const fileStream = fs.createReadStream(sqlFile, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let currentStmt = '';
  let executedCount = 0;
  let errorCount = 0;

  try {
    for await (const line of rl) {
      const trimmed = line.trim();

      // Bỏ qua dòng trống hoặc comment
      if (!trimmed || trimmed.startsWith('--')) continue;

      currentStmt += line + '\n';

      // Kết thúc 1 câu lệnh SQL khi gặp dấu ';' ở cuối dòng
      if (trimmed.endsWith(';')) {
        try {
          await client.query(currentStmt);
          executedCount++;
          if (executedCount % 50 === 0 || executedCount === 1) {
            console.log(`   --> Đã thực thi ${executedCount} block lệnh SQL...`);
          }
        } catch (stmtErr) {
          errorCount++;
          console.error(`⚠️ Lỗi câu lệnh #${executedCount + 1}:`, stmtErr.message);
        }
        currentStmt = '';
      }
    }

    if (currentStmt.trim()) {
      await client.query(currentStmt).catch(err => console.error('⚠️ Lỗi câu lệnh cuối:', err.message));
    }

    console.log(`\n========================================================`);
    console.log(`✅ ĐÃ NẠP THÀNH CÔNG TOÀN BỘ DỮ LIỆU (backtest3, backtest7) VÀ SYSTEM LOGS VÀO PRODUCTION!`);
    console.log(`📊 Tổng số block lệnh SQL đã chạy: ${executedCount}`);
    if (errorCount > 0) {
      console.log(`⚠️ Số câu lệnh lỗi bỏ qua: ${errorCount}`);
    }
    console.log(`========================================================\n`);

  } catch (err) {
    console.error('❌ Lỗi tiến trình nạp SQL:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

importData();

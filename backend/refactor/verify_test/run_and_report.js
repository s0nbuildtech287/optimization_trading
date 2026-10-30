// backend/refactor/verify_test/run_and_report.js
// Script chạy toàn bộ Test Suite và tự sinh Báo cáo Đánh giá Hồi quy dữ liệu (Markdown Report).
// Hỗ trợ kiểm thử liên tục trong chiến dịch refactor của LotusQuant.

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.resolve(__dirname, '../report_test');
const BASELINE_DIR = path.resolve(__dirname, '../result_test/baseline');
const LATEST_DIR = path.resolve(__dirname, '../result_test/latest');

// Tạo thư mục báo cáo nếu chưa có
fs.mkdirSync(REPORT_DIR, { recursive: true });

// Danh sách các file test cần thực thi tuần tự
const TEST_FILES = [
  'refactor/verify_test/backend/api_contract.test.js',
  'refactor/verify_test/backend/calculations.test.js',
  'refactor/verify_test/backend/filter_pagination.test.js',
  'refactor/verify_test/backend/edge_cases.test.js',
  'refactor/verify_test/backend/pool.test.js',
  'refactor/verify_test/frontend/frontend_logic.test.js'
];

// Helper so sánh sâu hai đối tượng JSON và gom các điểm lệch
function deepDiff(obj1, obj2, currentPath = '') {
  const diffs = [];

  if (typeof obj1 !== typeof obj2) {
    diffs.push(`Khác kiểu dữ liệu tại [${currentPath}]: Mong đợi ${typeof obj1}, nhận được ${typeof obj2}`);
    return diffs;
  }

  if (obj1 === null || obj2 === null || typeof obj1 !== 'object') {
    if (typeof obj1 === 'number' && typeof obj2 === 'number') {
      if (Math.abs(obj1 - obj2) > 0.0001) {
        diffs.push(`Khác giá trị số tại [${currentPath}]: Mong đợi ${obj1}, nhận được ${obj2}`);
      }
    } else if (obj1 !== obj2) {
      diffs.push(`Khác giá trị tại [${currentPath}]: Mong đợi "${obj1}", nhận được "${obj2}"`);
    }
    return diffs;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  for (const key of keys1) {
    if (!keys2.includes(key)) {
      diffs.push(`Thiếu thuộc tính "${key}" tại [${currentPath}]`);
    } else {
      const childPath = currentPath ? `${currentPath}.${key}` : key;
      diffs.push(...deepDiff(obj1[key], obj2[key], childPath));
    }
  }

  for (const key of keys2) {
    if (!keys1.includes(key)) {
      diffs.push(`Dư thừa thuộc tính "${key}" tại [${currentPath}]`);
    }
  }

  return diffs;
}

// Chạy một test file và trả về log + kết quả
function runTestFile(file) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    // Sử dụng process.execPath để đảm bảo dùng đúng file thực thi Node.js đang chạy
    exec(`"${process.execPath}" --test ${file}`, (err, stdout, stderr) => {
      const duration = Date.now() - startTime;
      resolve({
        file,
        success: !err,
        durationMs: duration,
        output: stdout + stderr
      });
    });
  });
}

// Chạy toàn bộ chương trình báo cáo
async function main() {
  console.log('🏁 Bắt đầu thực thi bộ test kiểm thử hồi quy...');
  
  const testResults = [];
  for (const file of TEST_FILES) {
    console.log(`\n🏃 Đang chạy: ${file}...`);
    const res = await runTestFile(file);
    testResults.push(res);

    // In chi tiết log runner của từng file test ra màn hình console
    console.log('--- LOG CHI TIẾT RUNNER ---');
    console.log(res.output.trim());
    console.log('---------------------------');

    if (res.success) {
      console.log(`✅ Thành công (${res.durationMs}ms)`);
    } else {
      console.error(`❌ Thất bại (${res.durationMs}ms)`);
    }
  }

  // SO SÁNH SNAPSHOTS GIỮA BASELINE VÀ LATEST
  console.log('🔍 Bắt đầu đối chiếu tệp snapshots dữ liệu...');
  const baselineFiles = fs.existsSync(BASELINE_DIR) ? fs.readdirSync(BASELINE_DIR) : [];
  const snapshotDiffs = {};
  let totalDiffCount = 0;

  for (const file of baselineFiles) {
    if (!file.endsWith('.json')) continue;

    const baselinePath = path.join(BASELINE_DIR, file);
    const latestPath = path.join(LATEST_DIR, file);

    if (!fs.existsSync(latestPath)) {
      snapshotDiffs[file] = ['Thiếu tệp snapshot kết quả chạy mới nhất (latest).'];
      totalDiffCount++;
      continue;
    }

    try {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));

      const diffs = deepDiff(baseline, latest);
      if (diffs.length > 0) {
        snapshotDiffs[file] = diffs;
        totalDiffCount += diffs.length;
      }
    } catch (e) {
      snapshotDiffs[file] = [`Lỗi khi đọc hoặc phân tích file JSON: ${e.message}`];
      totalDiffCount++;
    }
  }

  // Dọn dẹp các tệp báo cáo cũ dạng report_*.md
  const reportFiles = fs.existsSync(REPORT_DIR) ? fs.readdirSync(REPORT_DIR) : [];
  for (const file of reportFiles) {
    if (file.startsWith('report_') && file.endsWith('.md')) {
      fs.unlinkSync(path.join(REPORT_DIR, file));
    }
  }

  // BIÊN SOẠN BÁO CÁO MARKDOWN
  const latestReportPath = path.join(REPORT_DIR, 'latest_report.md');

  const failedTests = testResults.filter(r => !r.success);
  const isSystemSafe = failedTests.length === 0 && totalDiffCount === 0;

  // Lấy trạng thái từng trang theo kết quả test thô và snapshot
  const getStatus = (testsPassed, snapshotsPassed) => {
    return (testsPassed && snapshotsPassed) ? '🟢 OK' : '🔴 FAIL';
  };

  const isApiContractOk = testResults.find(r => r.file.includes('api_contract'))?.success;
  const isCalculationsOk = testResults.find(r => r.file.includes('calculations'))?.success;
  const isFilterPaginationOk = testResults.find(r => r.file.includes('filter_pagination'))?.success;
  const isFeLogicOk = testResults.find(r => r.file.includes('frontend_logic'))?.success;

  const isSnapshotOk = (filePattern) => {
    return !Object.keys(snapshotDiffs).some(f => f.includes(filePattern));
  };

  const statusComboFilters = getStatus(isFilterPaginationOk && isFeLogicOk, true);
  const statusOverview = getStatus(isCalculationsOk && isApiContractOk, isSnapshotOk('api_dashboard_default'));
  const statusRisk = getStatus(isCalculationsOk && isApiContractOk, isSnapshotOk('api_dashboard_risk_analysis'));
  const statusBehavior = getStatus(isCalculationsOk && isApiContractOk, isSnapshotOk('api_dashboard_behavior_analysis'));
  const statusComparative = getStatus(isCalculationsOk && isApiContractOk, isSnapshotOk('api_dashboard_comparative_ranking'));
  const statusOrderList = getStatus(isCalculationsOk && isApiContractOk, true);
  const statusStrategies = getStatus(isFilterPaginationOk && isFeLogicOk && isApiContractOk, isSnapshotOk('api_strategies'));
  const statusMarketWatch = getStatus(isApiContractOk, isSnapshotOk('api_market_prices') && isSnapshotOk('api_market_symbol_stats'));
  const statusNews = getStatus(isApiContractOk, isSnapshotOk('api_market_news'));

  let md = `🛡️ BÁO CÁO SO SÁNH DỮ LIỆU & HỒI QUY (REGRESSION REPORT)
Thời gian chạy: ${new Date().toLocaleString('vi-VN')}

[1] TỔNG QUAN HỆ THỐNG
- Trạng thái an toàn: ${isSystemSafe ? '🟢 AN TOÀN' : '🔴 CÓ LỆCH DỮ LIỆU / CẢNH BÁO'}
- Kết luận: ${
      isSystemSafe 
        ? 'Không phát hiện bất kỳ sự thay đổi behavior hoặc sai số dữ liệu nào. ĐỦ ĐIỀU KIỆN TIẾP TỤC REFACTOR.' 
        : 'DỪNG LẠI NGAY LẬP TỨC! Có lỗi test hoặc lệch dữ liệu so với baseline gốc. Kiểm tra lại code vừa refactor.'
    }


[2] TRẠNG THÁI HIỂN THỊ CÁC TRANG & CHỨC NĂNG (VISUAL PAGES CHECKLIST)

- Liên kết API & Bộ lọc kết hợp ............................. [ ${statusComboFilters} ]
  (Khóa cứng query SQL động và bộ xử lý tham số lọc nâng cao ngoài FE)

- Trang Overview (Dashboard Tổng quan) ...................... [ ${statusOverview} ]
  (Kiểm chứng KPI thô, mảng dữ liệu đồ thị tổng quan tháng/năm khớp 100%)

- Trang Risk Analysis (Phân tích Rủi ro) ...................... [ ${statusRisk} ]
  [Chi tiết hoạt động các Tab con]:
  + Risk View: Khóa hard/soft flags qua 'allFlags'
  + Strategy View: Khóa bảng thống kê flags từng Bot qua 'strategyView'
  + Portfolio Checks: Khóa biểu đồ exposure, Neutral Ratio qua 'portfolioChecks'
  + Volume Optimization: Khóa đường cong tối ưu hóa khối lượng qua 'volumeOptimization'

- Trang Behavior Analysis (Hành vi Bot) ..................... [ ${statusBehavior} ]
  [Chi tiết hoạt động các Tab con]:
  + Directional Bias: Khóa heatmap 24h, mốc Y-scale và bias status
  + Trading Activity: Khóa dữ liệu gap và bảng activity logs
  + Exit Behavior: Khóa biểu đồ tròn tỷ lệ TP, SL, cutoff
  + Holding & Recovery: Khóa biểu đồ phân tán Holding vs Volatility và HTR/VEI status

- Trang Comparative Ranking (Ma trận Xếp hạng) ............... [ ${statusComparative} ]
  (Khóa cứng toàn bộ điểm Composite chuẩn hóa và mảng xếp hạng đa chỉ số thô)

- Trang Strategies (Danh sách chiến thuật) ................... [ ${statusStrategies} ]
  (Kiểm thử bộ lọc kết hợp phức tạp, phân trang và sắp xếp)

- Trang Order List (Danh sách deals giao dịch) ............... [ ${statusOrderList} ]
  (Kiểm chứng phân trang SQL thô và tính toán lợi nhuận ròng)

- Trang Market Watch (Theo dõi thị trường) .................. [ ${statusMarketWatch} ]
  (Kiểm tra API dữ liệu giá thị trường và thống kê zone hiệu năng theo symbol)

- Trang News (Tin tức thị trường) ........................... [ ${statusNews} ]
  (Kiểm tra API tin tức thị trường theo symbol)


[3] CHI TIẾT KẾT QUẢ TEST RUNNER
`;

  testResults.forEach(res => {
    const fileName = res.file.split('/').pop();
    const dots = '.'.repeat(60 - fileName.length);
    md += `- ${fileName} ${dots} [ ${res.success ? '🟢 PASS' : '🔴 FAIL'} ]\n`;
  });

  md += `

[4] ĐỐI CHIẾU HỒI QUY SNAPSHOT (BASELINE vs LATEST)
- Tổng số lỗi lệch dữ liệu phát hiện: ${totalDiffCount} lỗi.
`;

  if (totalDiffCount === 0) {
    md += `- Kết luận đối chiếu: Tuyệt vời! Toàn bộ cấu trúc JSON và các chỉ số dấu phẩy động khớp 100% với dữ liệu đóng băng gốc.\n`;
  } else {
    for (const [file, diffList] of Object.entries(snapshotDiffs)) {
      md += `\nTệp lệch: ${file}\n`;
      diffList.forEach(diff => {
        md += `  [DIFF] ${diff}\n`;
      });
    }
  }

  md += `


[5] CHI TIẾT LOG LỖI RUNNER (NẾU CÓ)
`;

  if (failedTests.length === 0) {
    md += `Không có lỗi.`;
  } else {
    failedTests.forEach(res => {
      md += `\nLỗi tại ${res.file}:\n${res.output.trim()}\n`;
    });
  }

  // Ghi duy nhất tệp báo cáo mới nhất
  fs.writeFileSync(latestReportPath, md, 'utf8');

  console.log(`\n🎉 Báo cáo chi tiết đã được cập nhật thành công tại:`);
  console.log(`   - Gần nhất: refactor/report_test/latest_report.md`);

  process.exit(isSystemSafe ? 0 : 1);
}

main();

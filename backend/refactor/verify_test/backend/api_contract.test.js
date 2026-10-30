// backend/refactor/verify_test/backend/api_contract.test.js
// Nhóm 1: API Contract & Response Format Testing
// Sử dụng Test Runner tích hợp của Node.js v24 (node:test) để chạy cực nhanh và độc lập.

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5000;
const BASELINE_DIR = path.resolve(__dirname, '../../result_test/baseline');
const LATEST_DIR = path.resolve(__dirname, '../../result_test/latest');

// Tạo thư mục nếu chưa tồn tại
fs.mkdirSync(BASELINE_DIR, { recursive: true });
fs.mkdirSync(LATEST_DIR, { recursive: true });

// Danh sách kịch bản test API Contract
const SCENARIOS = [
  {
    name: 'api_strategies_list_default',
    url: `/api/strategies?page=1&pageSize=5`
  },
  {
    name: 'api_strategies_ids_only',
    url: `/api/strategies/ids`
  },
  {
    name: 'api_strategies_symbols_distinct',
    url: `/api/strategies/symbols/distinct`
  },
  {
    name: 'api_strategies_statistics_summary',
    url: `/api/strategies/statistics/summary`
  },
  {
    name: 'api_dashboard_default',
    url: `/api/dashboard`
  },
  {
    name: 'api_dashboard_risk_analysis',
    url: `/api/dashboard/risk-analysis`
  },
  {
    name: 'api_dashboard_behavior_analysis',
    url: `/api/dashboard/behavior-analysis`
  },
  {
    name: 'api_dashboard_comparative_ranking',
    url: `/api/dashboard/comparative-ranking`
  },
  {
    name: 'api_balance_chart_default',
    url: `/api/balance-chart/backtest_temp1/001BTCUSDH1OB`
  },
  {
    name: 'api_market_prices',
    url: `/api/market/prices`
  },
  {
    name: 'api_market_symbol_stats',
    url: `/api/market/symbol-stats/BTCUSD`
  },
  {
    name: 'api_market_news',
    url: `/api/market/news/BTCUSD`
  }
];

// Helper gọi API bằng HTTP GET
function fetchAPI(url) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${url}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

// Loại bỏ các trường động (timestamp, ageMs) để việc so sánh dữ liệu tĩnh chính xác
function cleanResponseData(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    // Chỉ lấy tối đa 10 phần tử đầu tiên để đối chiếu baseline (tối ưu hóa tốc độ và dung lượng)
    return obj.slice(0, 10).map(cleanResponseData);
  }
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      if (['timestamp', 'updatedAt', 'createdAt', 'ageMs', 'time', 'duration', 'generationTime'].includes(key)) {
        cleaned[key] = '[DYNAMIC_FIELD_IGNORED]';
      } else {
        cleaned[key] = cleanResponseData(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
}

// Tiến hành chạy test tuần tự cho từng scenario
test('Nhóm 1: API Contract - Đối chiếu cấu trúc & dữ liệu phản hồi', async (t) => {
  for (const scenario of SCENARIOS) {
    await t.test(`Scenario: ${scenario.name} (${scenario.url})`, async () => {
      console.log(`📡 Đang kiểm thử: ${scenario.url}`);
      const response = await fetchAPI(scenario.url);

      // Đảm bảo API phản hồi thành công
      assert.strictEqual(response.statusCode, 200, `API ${scenario.url} trả về lỗi status ${response.statusCode}`);

      let parsedBody;
      try {
        parsedBody = JSON.parse(response.body);
      } catch (e) {
        assert.fail(`Không thể parse JSON từ response của ${scenario.url}`);
      }

      // Nếu là API Market Watch hoặc News, chỉ check mã 200 và cấu trúc cơ bản, không so sánh snapshot
      if (scenario.name.startsWith('api_market_') || scenario.name.includes('news')) {
        assert.ok(parsedBody, 'Response body phải là JSON hợp lệ');
        if (scenario.name.includes('prices')) {
          assert.ok(Array.isArray(parsedBody.data), 'Prices phải trả về mảng dữ liệu');
        } else if (scenario.name.includes('stats') || scenario.name.includes('news')) {
          assert.strictEqual(parsedBody.symbol, 'BTCUSD', 'Symbol trả về phải khớp với tham số yêu cầu');
        }
        console.log(`✅ API ${scenario.name} hoạt động tốt (đã kiểm chứng cấu trúc phản hồi)`);
        return;
      }

      // Làm sạch dữ liệu biến động
      const cleanedData = {
        statusCode: response.statusCode,
        body: cleanResponseData(parsedBody)
      };

      const baselinePath = path.join(BASELINE_DIR, `${scenario.name}.json`);
      const latestPath = path.join(LATEST_DIR, `${scenario.name}.json`);

      // GHI BẢN MẪU (BASELINE) NẾU CHƯA CÓ
      if (!fs.existsSync(baselinePath)) {
        fs.writeFileSync(baselinePath, JSON.stringify(cleanedData, null, 2), 'utf8');
        console.log(`💾 Đã tạo baseline mới cho: ${scenario.name}`);
        // Chấp nhận pass cho lần tạo đầu tiên
        return;
      }

      // GHI BẢN CHẠY MỚI NHẤT (LATEST) ĐỂ SO SÁNH
      fs.writeFileSync(latestPath, JSON.stringify(cleanedData, null, 2), 'utf8');

      // ĐỌC VÀ SO SÁNH VỚI BASELINE GỐC
      const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

      try {
        assert.deepStrictEqual(cleanedData, baselineData);
        console.log(`✅ Khớp hoàn hảo baseline: ${scenario.name}`);
      } catch (err) {
        // Ghi nhận lỗi chi tiết
        console.error(`🚨 Phát hiện sự khác biệt dữ liệu tại: ${scenario.name}`);
        throw err;
      }
    });
  }
});

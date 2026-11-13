const express = require('express');
const router = express.Router();
const controller = require('../controller/paperTradeController');

// Route lấy toàn bộ dữ liệu Dashboard (hỗ trợ query ?mode=futures hoặc ?mode=spot)
router.get('/dashboard', controller.getDashboardData);

// Route lấy giá trực tiếp từ Binance WebSocket cache
router.get('/prices', controller.getLivePrices);

// Route bật/tắt bot tự động vào lệnh (Futures / Spot)
router.post('/toggle', controller.toggleBot);

// Route đóng lệnh Futures thủ công bằng tay
router.post('/positions/:positionId/close', controller.closePosition);

// Route bán chốt lệnh Spot thủ công
router.post('/spot/sell', controller.sellSpotHolding);

// Route mua gom Spot thủ công
router.post('/spot/buy', controller.buySpotHolding);

// Route reset tài khoản về mốc vốn mới (Futures / Spot)
router.post('/reset', controller.resetAccount);

// Route cập nhật cài đặt vốn và quản trị rủi ro (Futures / Spot)
router.post('/settings', controller.updateSettings);

// Route thêm cặp coin theo dõi
router.post('/symbols/add', controller.addSymbol);

// Route xóa cặp coin theo dõi
router.post('/symbols/remove', controller.removeSymbol);

module.exports = router;

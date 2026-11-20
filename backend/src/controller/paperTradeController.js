const paperTradeEngine = require('../service/paperTradeEngine');
const binanceWsService = require('../service/binanceWsService');

async function getDashboardData(req, res) {
  try {
    const mode = req.query.mode || 'futures';
    const data = await paperTradeEngine.getDashboardData(mode);
    return res.status(200).json({
      success: true,
      data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function toggleBot(req, res) {
  try {
    const { isActive, mode = 'futures' } = req.body;
    const account = await paperTradeEngine.toggleBot(mode, Boolean(isActive));
    return res.status(200).json({
      success: true,
      data: account
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function closePosition(req, res) {
  try {
    const { positionId } = req.params;
    const result = await paperTradeEngine.closeFuturesPositionManually(positionId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function sellSpotHolding(req, res) {
  try {
    const { symbol } = req.body;
    const result = await paperTradeEngine.sellSpotHoldingManually(symbol);
    return res.status(200).json({
      success: true,
      message: `Đã bán chốt lệnh Spot ${symbol}`,
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function buySpotHolding(req, res) {
  try {
    const { symbol, amountUsdt = 25 } = req.body;
    const result = await paperTradeEngine.buySpotHoldingManually(symbol, amountUsdt);
    return res.status(200).json({
      success: true,
      message: `Đã mua gom Spot ${symbol}`,
      data: result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function resetAccount(req, res) {
  try {
    const { initialBalance = 100.0, riskPerTrade = null, leverage = null, mode = 'futures' } = req.body;
    const account = await paperTradeEngine.resetAccount(
      mode,
      Number(initialBalance),
      riskPerTrade ? Number(riskPerTrade) : null,
      leverage ? Number(leverage) : null
    );
    return res.status(200).json({
      success: true,
      message: 'Tài khoản đã được reset thành công',
      data: account
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function updateSettings(req, res) {
  try {
    const { balance, riskPerTrade, leverage, mode = 'futures' } = req.body;
    const account = await paperTradeEngine.updateSettings(mode, { balance, riskPerTrade, leverage });
    return res.status(200).json({
      success: true,
      message: 'Cập nhật cài đặt thành công',
      data: account
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function addSymbol(req, res) {
  try {
    const { symbol, mode = 'futures' } = req.body;
    const account = await paperTradeEngine.addTrackedSymbol(mode, symbol);
    return res.status(200).json({
      success: true,
      message: `Đã thêm ${symbol} thành công`,
      data: account
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function removeSymbol(req, res) {
  try {
    const { symbol, mode = 'futures' } = req.body;
    const account = await paperTradeEngine.removeTrackedSymbol(mode, symbol);
    return res.status(200).json({
      success: true,
      message: `Đã xóa ${symbol} thành công`,
      data: account
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function withdrawProfit(req, res) {
  try {
    const { amount, mode = 'futures' } = req.body;
    const result = await paperTradeEngine.withdrawProfit(mode, amount);
    return res.status(200).json({
      success: true,
      message: `Đã rút thành công $${result.withdrawnAmount.toFixed(2)} USDT về két an toàn`,
      data: result
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
}

async function getLivePrices(req, res) {
  try {
    const prices = binanceWsService.getAllPrices();
    return res.status(200).json({
      success: true,
      data: prices
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

module.exports = {
  getDashboardData,
  toggleBot,
  closePosition,
  sellSpotHolding,
  buySpotHolding,
  resetAccount,
  updateSettings,
  addSymbol,
  removeSymbol,
  withdrawProfit,
  getLivePrices
};

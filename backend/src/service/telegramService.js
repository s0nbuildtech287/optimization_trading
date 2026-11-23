const https = require('https');
const axios = require('axios');
const paperTradeDao = require('../dao/paperTradeDao');
const binanceWsService = require('./binanceWsService');

const httpsAgent = new https.Agent({ family: 4, keepAlive: true });
const http = axios.create({ httpsAgent });

class TelegramService {
  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || '9099025717:AAFA3r9z22NflAKNRdcp-YezmOQ862hQ4Pw';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '8015325390';
    this.baseUrl = '';
    this.isPolling = false;
    this.offset = 0;
    this.pollTimeout = null;
    this.engine = null;
  }

  setEngine(engine) {
    this.engine = engine;
  }

  init() {
    this.token = process.env.TELEGRAM_BOT_TOKEN || this.token || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || this.chatId || '8015325390';

    if (!this.token) {
      console.log('[Telegram] TELEGRAM_BOT_TOKEN chưa được cấu hình.');
      return;
    }

    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
    console.log('[Telegram] Khởi động Telegram Service (IPv4 mode) với Token...');
    this.startPolling();
  }

  updateConfig(token, chatId) {
    if (token) this.token = token;
    if (chatId) this.chatId = chatId;
    if (this.token) {
      this.baseUrl = `https://api.telegram.org/bot${this.token}`;
      if (!this.isPolling) {
        this.startPolling();
      }
    }
  }

  async sendMessage(chatId, text, replyMarkup = null) {
    if (!this.baseUrl) return;
    const targetChat = chatId || this.chatId;
    if (!targetChat) return;

    try {
      const payload = {
        chat_id: targetChat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }
      await http.post(`${this.baseUrl}/sendMessage`, payload, { timeout: 10000 });
    } catch (err) {
      console.error('[Telegram] Lỗi gửi tin nhắn:', err?.response?.data?.description || err.message);
    }
  }

  async answerCallback(callbackQueryId, text = '') {
    if (!this.baseUrl || !callbackQueryId) return;
    try {
      await http.post(`${this.baseUrl}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text
      }, { timeout: 5000 });
    } catch (err) {
      // Bỏ qua lỗi timeout callback
    }
  }

  getMainKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: '📊 PnL Hôm nay', callback_data: 'cmd_pnl_today' },
          { text: '📅 Lịch PnL 7 ngày', callback_data: 'cmd_pnl_7d' }
        ],
        [
          { text: '🟡 Danh mục Spot', callback_data: 'cmd_spot' },
          { text: '⚡ Vị thế đang mở', callback_data: 'cmd_positions' }
        ],
        [
          { text: '🤖 6 Bot Futures', callback_data: 'cmd_bots' },
          { text: '💰 Tổng tài sản', callback_data: 'cmd_equity' }
        ],
        [
          { text: '🔄 Làm mới Menu', callback_data: 'cmd_menu' }
        ]
      ]
    };
  }

  async startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    const poll = async () => {
      if (!this.isPolling || !this.baseUrl) return;

      try {
        const res = await http.get(`${this.baseUrl}/getUpdates`, {
          params: {
            offset: this.offset,
            timeout: 10
          },
          timeout: 15000
        });

        if (res.data && res.data.ok && Array.isArray(res.data.result)) {
          for (const update of res.data.result) {
            this.offset = update.update_id + 1;
            await this.handleUpdate(update);
          }
        }
      } catch (err) {
        if (err.code !== 'ECONNABORTED' && !err.message.includes('timeout')) {
          console.error('[Telegram] Lỗi poll getUpdates:', err.message);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (this.isPolling) {
        this.pollTimeout = setTimeout(poll, 300);
      }
    };

    poll();
    console.log('[Telegram] Polling updates đã bắt đầu lắng nghe lệnh (IPv4)...');
  }

  async handleUpdate(update) {
    try {
      // 1. Xử lý tin nhắn văn bản (Commands)
      if (update.message && update.message.text) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text.trim();

        if (!this.chatId) {
          this.chatId = chatId;
          console.log(`[Telegram] Đã tự động nhận diện Chat ID: ${this.chatId}`);
        }

        const cmd = text.toLowerCase().split(' ')[0];

        switch (cmd) {
          case '/start':
          case '/menu':
          case '/help':
            await this.handleMenuCommand(chatId);
            break;
          case '/pnl':
            await this.handlePnlCommand(chatId);
            break;
          case '/history':
          case '/calendar':
            await this.handleHistoryCommand(chatId);
            break;
          case '/spot':
            await this.handleSpotCommand(chatId);
            break;
          case '/positions':
          case '/pos':
            await this.handlePositionsCommand(chatId);
            break;
          case '/bots':
            await this.handleBotsCommand(chatId);
            break;
          case '/equity':
          case '/total':
            await this.handleEquityCommand(chatId);
            break;
          default:
            if (cmd.startsWith('/bot')) {
              const botNum = parseInt(cmd.replace('/bot', ''), 10);
              if (botNum >= 1 && botNum <= 6) {
                await this.handleBotDetailCommand(chatId, botNum);
                break;
              }
            }
            await this.sendMessage(chatId, 'Lệnh không nhận dạng được. Bấm /menu để xem các nút thao tác nhanh.', this.getMainKeyboard());
            break;
        }
      }

      // 2. Xử lý nút bấm chạm (Callback Queries)
      if (update.callback_query) {
        const cq = update.callback_query;
        const chatId = cq.message.chat.id;
        const data = cq.data;

        await this.answerCallback(cq.id);

        switch (data) {
          case 'cmd_pnl_today':
            await this.handlePnlCommand(chatId);
            break;
          case 'cmd_pnl_7d':
            await this.handleHistoryCommand(chatId);
            break;
          case 'cmd_spot':
            await this.handleSpotCommand(chatId);
            break;
          case 'cmd_positions':
            await this.handlePositionsCommand(chatId);
            break;
          case 'cmd_bots':
            await this.handleBotsCommand(chatId);
            break;
          case 'cmd_equity':
            await this.handleEquityCommand(chatId);
            break;
          case 'cmd_menu':
            await this.handleMenuCommand(chatId);
            break;
          default:
            if (data.startsWith('bot_detail_')) {
              const num = parseInt(data.replace('bot_detail_', ''), 10);
              await this.handleBotDetailCommand(chatId, num);
            }
            break;
        }
      }
    } catch (err) {
      console.error('[Telegram] Lỗi xử lý update:', err.message);
    }
  }

  async handleMenuCommand(chatId) {
    const text = 
      'Xin chào Boss!\n\n' +
      'Hệ thống Paper Trading tự động đã kết nối trực tiếp với tài khoản Telegram của anh.\n' +
      'Anh có thể bấm các nút bên dưới để tra cứu nhanh thông tin số dư, vị thế và lãi/lỗ:';
    await this.sendMessage(chatId, text, this.getMainKeyboard());
  }

  async handlePnlCommand(chatId) {
    try {
      const accounts = await paperTradeDao.getAllAccounts();
      const nowVn = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const monthVn = nowVn.slice(0, 7);

      const { dailyStats } = await paperTradeDao.getDailyPnLSummary({ accountId: 'ALL', month: monthVn });
      
      const todayStat = (dailyStats || []).find((d) => d.date === nowVn) || {
        trades_count: 0,
        winning_trades: 0,
        losing_trades: 0,
        total_pnl: 0
      };

      const todayTotalPnl = parseFloat(todayStat.total_pnl || 0);
      const winCount = parseInt(todayStat.winning_trades || 0, 10);
      const lossCount = parseInt(todayStat.losing_trades || 0, 10);
      const totalTrades = parseInt(todayStat.trades_count || 0, 10);
      const winrate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0.0';

      let text = `<b>BÁO CÁO PNL HÔM NAY (${nowVn})</b>\n`;
      text += `----------------------------------------\n`;
      text += `Tổng PnL đã chốt: <b>${todayTotalPnl >= 0 ? '+' : ''}$${todayTotalPnl.toFixed(2)} USDT</b>\n`;
      text += `Lệnh chốt lời: ${winCount} | Cắt lỗ: ${lossCount} (Winrate: ${winrate}%)\n\n`;

      text += `<b>Chi tiết từng tài khoản:</b>\n`;
      for (const acc of accounts) {
        const pnl = parseFloat(acc.realized_pnl || 0);
        const eq = parseFloat(acc.equity || 100);
        text += `- ${acc.name}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (Vốn: $${eq.toFixed(2)})\n`;
      }

      await this.sendMessage(chatId, text, this.getMainKeyboard());
    } catch (err) {
      await this.sendMessage(chatId, `Lỗi truy xuất PnL: ${err.message}`);
    }
  }

  async handleHistoryCommand(chatId) {
    try {
      const nowVn = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const monthVn = nowVn.slice(0, 7);
      const { dailyStats } = await paperTradeDao.getDailyPnLSummary({ accountId: 'ALL', month: monthVn });

      let monthTotalPnl = 0;
      let greenDays = 0;
      let redDays = 0;
      let totalTradesMonth = 0;

      for (const d of dailyStats || []) {
        const pnl = parseFloat(d.total_pnl || 0);
        monthTotalPnl += pnl;
        totalTradesMonth += parseInt(d.trades_count || 0, 10);
        if (pnl > 0) greenDays++;
        else if (pnl < 0) redDays++;
      }

      let text = `<b>LỊCH SỬ PNL THÁNG ${monthVn}</b>\n`;
      text += `----------------------------------------\n`;
      text += `Tổng PnL tháng: <b>${monthTotalPnl >= 0 ? '+' : ''}$${monthTotalPnl.toFixed(2)} USDT</b>\n`;
      text += `Ngày xanh: ${greenDays} | Ngày đỏ: ${redDays} | Tổng lệnh: ${totalTradesMonth}\n\n`;

      if (!dailyStats || dailyStats.length === 0) {
        text += `Chưa có lệnh nào được đóng trong tháng này.\n(Dữ liệu vừa được reset sạch từ 22/11/2026)`;
      } else {
        text += `<b>Lịch sử chi tiết theo ngày:</b>\n`;
        const recentDays = [...dailyStats].reverse().slice(0, 7);
        for (const item of recentDays) {
          const pnl = parseFloat(item.total_pnl || 0);
          const icon = pnl > 0 ? '🟢' : pnl < 0 ? '🔴' : '⚪';
          text += `${icon} ${item.date}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${item.trades_count} lệnh | Thắng: ${item.winning_trades})\n`;
        }
      }

      await this.sendMessage(chatId, text, this.getMainKeyboard());
    } catch (err) {
      await this.sendMessage(chatId, `Lỗi tra cứu lịch sử: ${err.message}`);
    }
  }

  async handleSpotCommand(chatId) {
    try {
      const spotAcc = await paperTradeDao.getAccount('acc_binance_spot');
      const holdings = await paperTradeDao.getSpotHoldings('acc_binance_spot');

      let text = `<b>TÀI KHOẢN BINANCE SPOT (DCA)</b>\n`;
      text += `----------------------------------------\n`;
      text += `Tiền mặt USDT khả dụng: <b>$${parseFloat(spotAcc.balance).toFixed(2)} USDT</b>\n`;
      text += `Tổng tài sản (Equity): <b>$${parseFloat(spotAcc.equity).toFixed(2)} USDT</b>\n`;
      text += `Lãi đã chốt thực tế: <b>${parseFloat(spotAcc.realized_pnl) >= 0 ? '+' : ''}$${parseFloat(spotAcc.realized_pnl).toFixed(2)} USDT</b>\n\n`;

      if (holdings.length === 0) {
        text += `Danh mục: Đang trống (chưa có coin nào chạm vùng RSI quá bán).\n`;
      } else {
        text += `<b>Danh mục coin đang nắm giữ (${holdings.length}):</b>\n`;
        for (const h of holdings) {
          const curPrice = binanceWsService.getPrice(h.symbol) || parseFloat(h.avg_buy_price);
          const cost = parseFloat(h.total_cost);
          const curVal = parseFloat(h.quantity) * curPrice;
          const pnl = curVal - cost;
          const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
          const sign = pnl >= 0 ? '+' : '';

          text += `• <b>${h.symbol}</b>: $${cost.toFixed(1)} -> $${curVal.toFixed(1)} (${sign}${pnlPct.toFixed(1)}% | ${sign}$${pnl.toFixed(2)})\n`;
        }
      }

      await this.sendMessage(chatId, text, this.getMainKeyboard());
    } catch (err) {
      await this.sendMessage(chatId, `Lỗi tra cứu Spot: ${err.message}`);
    }
  }

  async handlePositionsCommand(chatId) {
    try {
      const positions = await paperTradeDao.getOpenPositions('ALL');

      let text = `<b>DANH SÁCH VỊ THẾ FUTURES ĐANG MỞ (${positions.length})</b>\n`;
      text += `----------------------------------------\n`;

      if (positions.length === 0) {
        text += `Hiện tại không có vị thế Futures nào đang mở.\nCác bot đang quét nến M15/H4 chờ tín hiệu.`;
      } else {
        for (const p of positions) {
          const curPrice = binanceWsService.getPrice(p.symbol) || parseFloat(p.entry_price);
          const entryPrice = parseFloat(p.entry_price);
          const qty = parseFloat(p.quantity);
          const pnl = p.side === 'LONG' ? (curPrice - entryPrice) * qty : (entryPrice - curPrice) * qty;
          const margin = parseFloat(p.margin);
          const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0;
          const sign = pnl >= 0 ? '+' : '';

          text += `⚡ <b>[${p.account_id.replace('acc_futures_', '').replace('acc_binance_', '')}] ${p.side} ${p.symbol}</b>\n`;
          text += `  Giá vào: ${entryPrice} | Hiện tại: ${curPrice}\n`;
          text += `  Ký quỹ: $${margin.toFixed(1)} (${p.leverage}x) | PnL: ${sign}$${pnl.toFixed(2)} (${sign}${pnlPct.toFixed(1)}%)\n`;
          text += `  SL: ${p.stop_loss} | TP: ${p.take_profit}\n\n`;
        }
      }

      await this.sendMessage(chatId, text, this.getMainKeyboard());
    } catch (err) {
      await this.sendMessage(chatId, `Lỗi tra cứu vị thế: ${err.message}`);
    }
  }

  async handleBotsCommand(chatId) {
    try {
      const accounts = await paperTradeDao.getAllAccounts();
      const futuresBots = accounts.filter((a) => a.id !== 'acc_binance_spot');

      let text = `<b>ĐẤU TRƯỜNG 6 CHIẾN LƯỢC FUTURES</b>\n`;
      text += `----------------------------------------\n`;

      const botButtons = [];
      let idx = 1;

      for (const b of futuresBots) {
        const eq = parseFloat(b.equity || 100);
        const pnl = parseFloat(b.realized_pnl || 0);
        const winrate = b.total_trades > 0 ? ((b.winning_trades / b.total_trades) * 100).toFixed(1) : '0.0';

        text += `${idx}. <b>${b.name}</b>\n`;
        text += `   Tài sản: $${eq.toFixed(2)} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}\n`;
        text += `   Thắng: ${b.winning_trades}/${b.total_trades} (Winrate: ${winrate}%)\n\n`;

        botButtons.push({ text: `Bot ${idx}`, callback_data: `bot_detail_${idx}` });
        idx++;
      }

      const keyboard = {
        inline_keyboard: [
          botButtons.slice(0, 3),
          botButtons.slice(3, 6),
          [{ text: '🔄 Làm mới Menu', callback_data: 'cmd_menu' }]
        ]
      };

      await this.sendMessage(chatId, text, keyboard);
    } catch (err) {
      await this.sendMessage(chatId, `Lỗi tra cứu bot: ${err.message}`);
    }
  }

  async handleBotDetailCommand(chatId, botNum) {
    try {
      const accounts = await paperTradeDao.getAllAccounts();
      const futuresBots = accounts.filter((a) => a.id !== 'acc_binance_spot');
      const bot = futuresBots[botNum - 1];

      if (!bot) {
        await this.sendMessage(chatId, 'Không tìm thấy bot yêu cầu.');
        return;
      }

      const eq = parseFloat(bot.equity || 100);
      const bal = parseFloat(bot.balance || 100);
      const pnl = parseFloat(bot.realized_pnl || 0);
      const winrate = bot.total_trades > 0 ? ((bot.winning_trades / bot.total_trades) * 100).toFixed(1) : '0.0';

      const positions = await paperTradeDao.getOpenPositions(bot.id);

      let text = `<b>CHI TIẾT: ${bot.name.toUpperCase()}</b>\n`;
      text += `----------------------------------------\n`;
      text += `Trạng thái: ${bot.is_bot_active ? '🟢 ĐANG BẬT' : '🔴 ĐANG TẮT'}\n`;
      text += `Vốn hiện tại: <b>$${eq.toFixed(2)} USDT</b> (Tiền mặt: $${bal.toFixed(2)})\n`;
      text += `Lãi/Lỗ tích lũy: <b>${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} USDT</b>\n`;
      text += `Tổng lệnh: ${bot.total_trades} (Thắng: ${bot.winning_trades} | Thua: ${bot.losing_trades})\n`;
      text += `Tỷ lệ thắng (Winrate): <b>${winrate}%</b>\n`;
      text += `Sụt giảm tối đa (Max Drawdown): ${parseFloat(bot.max_drawdown_pct || 0).toFixed(1)}%\n`;
      text += `Số coin theo dõi: ${(bot.tracked_symbols || []).join(', ')}\n\n`;

      if (positions.length > 0) {
        text += `<b>Vị thế đang mở (${positions.length}):</b>\n`;
        for (const p of positions) {
          text += `- ${p.side} ${p.symbol} @ ${p.entry_price} (SL: ${p.stop_loss} | TP: ${p.take_profit})\n`;
        }
      } else {
        text += `Không có vị thế nào đang mở.\n`;
      }

      await this.sendMessage(chatId, text, this.getMainKeyboard());
    } catch (err) {
      await this.sendMessage(chatId, `Lỗi tra cứu bot: ${err.message}`);
    }
  }

  async handleEquityCommand(chatId) {
    try {
      const accounts = await paperTradeDao.getAllAccounts();
      let totalEquity = 0;
      let totalBalance = 0;
      let totalRealized = 0;

      for (const a of accounts) {
        totalEquity += parseFloat(a.equity || 0);
        totalBalance += parseFloat(a.balance || 0);
        totalRealized += parseFloat(a.realized_pnl || 0);
      }

      let text = `<b>BÁO CÁO TỔNG TÀI SẢN TOÀN HỆ THỐNG</b>\n`;
      text += `----------------------------------------\n`;
      text += `Tổng tài sản (Equity): <b>$${totalEquity.toFixed(2)} USDT</b>\n`;
      text += `Tiền mặt khả dụng: <b>$${totalBalance.toFixed(2)} USDT</b>\n`;
      text += `Tổng PnL thực tế: <b>${totalRealized >= 0 ? '+' : ''}$${totalRealized.toFixed(2)} USDT</b>\n`;
      text += `Quy mô: 1 ví Spot + 6 ví Futures ($100/ví xuất phát)\n`;

      await this.sendMessage(chatId, text, this.getMainKeyboard());
    } catch (err) {
      await this.sendMessage(chatId, `Lỗi tra cứu tổng tài sản: ${err.message}`);
    }
  }

  // --- CÁC HÀM BẮN THÔNG BÁO TỰ ĐỘNG KHI VÀO / RA LỆNH ---

  async notifyOrderOpened(botName, action, symbol, price, stopLoss, takeProfit, margin, leverage, reason) {
    const text = 
      `🚀 <b>VÀO LỆNH MỚI: [${botName}]</b>\n` +
      `----------------------------------------\n` +
      `Cặp: <b>${symbol}</b> | Chiều: <b>${action}</b>\n` +
      `Giá vào: <b>${price}</b>\n` +
      `Ký quỹ: $${parseFloat(margin).toFixed(1)} (${leverage}x)\n` +
      `Stop Loss: ${stopLoss}\n` +
      `Take Profit: ${takeProfit}\n` +
      `Lý do: ${reason}`;
    await this.sendMessage(this.chatId, text);
  }

  async notifyOrderClosed(botName, action, symbol, exitPrice, netPnl, pnlPct, exitReason) {
    const isWin = parseFloat(netPnl) >= 0;
    const icon = isWin ? '🎉' : '⚠️';
    const text = 
      `${icon} <b>ĐÓNG LỆNH: [${botName}]</b>\n` +
      `----------------------------------------\n` +
      `Cặp: <b>${symbol}</b> | Đóng vị thế: <b>${action}</b>\n` +
      `Giá thoát: <b>${exitPrice}</b>\n` +
      `Kết quả: <b>${isWin ? '+' : ''}$${parseFloat(netPnl).toFixed(2)} USDT (${isWin ? '+' : ''}${parseFloat(pnlPct).toFixed(1)}%)</b>\n` +
      `Lý do đóng: ${exitReason}`;
    await this.sendMessage(this.chatId, text);
  }

  async notifySpotBuy(symbol, price, spendUsdt, reason) {
    const text = 
      `🛒 <b>SPOT GOM HÀNG: ${symbol}</b>\n` +
      `----------------------------------------\n` +
      `Giá mua: <b>${price}</b>\n` +
      `Số tiền gom: <b>$${parseFloat(spendUsdt).toFixed(2)} USDT</b>\n` +
      `Lý do: ${reason}`;
    await this.sendMessage(this.chatId, text);
  }

  async notifySpotSell(symbol, price, netPnl, pnlPct, reason) {
    const isWin = parseFloat(netPnl) >= 0;
    const icon = isWin ? '💰' : '⚠️';
    const text = 
      `${icon} <b>SPOT CHỐT VỊ THẾ: ${symbol}</b>\n` +
      `----------------------------------------\n` +
      `Giá bán: <b>${price}</b>\n` +
      `Lãi/Lỗ: <b>${isWin ? '+' : ''}$${parseFloat(netPnl).toFixed(2)} USDT (${isWin ? '+' : ''}${parseFloat(pnlPct).toFixed(1)}%)</b>\n` +
      `Lý do: ${reason}`;
    await this.sendMessage(this.chatId, text);
  }

  async notifyAlert(title, message) {
    const text = 
      `🚨 <b>CẢNH BÁO: ${title}</b>\n` +
      `----------------------------------------\n` +
      `${message}`;
    await this.sendMessage(this.chatId, text);
  }
}

module.exports = new TelegramService();

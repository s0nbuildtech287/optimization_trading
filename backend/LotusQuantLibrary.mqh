//+------------------------------------------------------------------+
//|              LotusQuantLibrary.mqh - MQL5 Trading Library        |
//+------------------------------------------------------------------+
#property copyright "Copyright 2025, LotusQuant"
#property link "https://LotusQuant.com"
#include <Trade/Trade.mqh>
#include <socketlib.mqh>
class CTradeEx : public CTrade
{
public:
   bool PositionClose(const ulong ticket, const string m_comment = "", const ulong deviation = ULONG_MAX)
   {
      if (IsStopped(__FUNCTION__))
         return (false);
      if (!PositionSelectByTicket(ticket))
         return (false);
      string symbol = PositionGetString(POSITION_SYMBOL);
      ClearStructures();
      if (!FillingCheck(symbol))
         return (false);

      m_request.action = TRADE_ACTION_DEAL;
      m_request.position = ticket;
      m_request.symbol = symbol;
      m_request.volume = PositionGetDouble(POSITION_VOLUME);
      m_request.magic = m_magic;
      m_request.deviation = (deviation == ULONG_MAX) ? m_deviation : deviation;
      m_request.comment = m_comment;

      if ((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
      {
         m_request.type = ORDER_TYPE_SELL;
         m_request.price = SymbolInfoDouble(symbol, SYMBOL_BID);
      }
      else
      {
         m_request.type = ORDER_TYPE_BUY;
         m_request.price = SymbolInfoDouble(symbol, SYMBOL_ASK);
      }

      return (OrderSend(m_request, m_result));
   }
};
CTradeEx trade;

struct TradingSignals
{
   bool buy;
   bool sell;
   bool closeBuy;
   bool closeSell;
};

enum OrderEntryMode
{
   ENTRY_ATO,
   ENTRY_ATC,
   ENTRY_LIMIT_PREV_CLOSE
};
struct FailedAttempt
{
   datetime barTime;
   int magicNumber;
   ENUM_TIMEFRAMES timeframe;
   ENUM_ORDER_TYPE orderType;
};
struct TimeframeBarState
{
   ENUM_TIMEFRAMES timeframe;
   datetime lastBarTime;
   bool lastClosingState;
};
class CTradeCustomEx
{

private:
   ulong lastPositionTicket;
   static double s_multiplier;
   static bool registered;
   static datetime last_heartbeat_sent;
   static datetime last_server_response;
   static FailedAttempt lastFailedAttempts[];
   static TimeframeBarState barStates[];
   int GetOrCreateBarStateIndex(ENUM_TIMEFRAMES tf)
   {
      for (int i = 0; i < ArraySize(barStates); i++)
      {
         if (barStates[i].timeframe == tf)
            return i;
      }

      // Chưa có -> tạo mới
      int newIndex = ArraySize(barStates);
      ArrayResize(barStates, newIndex + 1);
      barStates[newIndex].timeframe = tf;
      barStates[newIndex].lastBarTime = 0;
      barStates[newIndex].lastClosingState = false;

      Print(" Created bar state for TF: ", TfToStr(tf));
      return newIndex;
   }

   bool HasFailedInCurrentBar(int magicNumber, ENUM_TIMEFRAMES tf, ENUM_ORDER_TYPE orderType)
   {
      datetime currentBarTime = iTime(_Symbol, tf, 0);

      for (int i = 0; i < ArraySize(lastFailedAttempts); i++)
      {
         if (lastFailedAttempts[i].barTime == currentBarTime &&
             lastFailedAttempts[i].magicNumber == magicNumber &&
             lastFailedAttempts[i].timeframe == tf &&
             lastFailedAttempts[i].orderType == orderType)
         {
            return true;
         }
      }
      return false;
   }
   string ErrorDescription(uint error_code)
   {
      switch (error_code)
      {
      case TRADE_RETCODE_DONE:
         return "Request completed";
      case TRADE_RETCODE_DONE_PARTIAL:
         return "Request partially completed";
      case TRADE_RETCODE_REJECT:
         return "Request rejected";
      case TRADE_RETCODE_CANCEL:
         return "Request canceled";
      case TRADE_RETCODE_PLACED:
         return "Order placed";
      case TRADE_RETCODE_ERROR:
         return "Request processing error";
      case TRADE_RETCODE_TIMEOUT:
         return "Request canceled by timeout";
      case TRADE_RETCODE_INVALID:
         return "Invalid request";
      case TRADE_RETCODE_INVALID_VOLUME:
         return "Invalid volume";
      case TRADE_RETCODE_INVALID_PRICE:
         return "Invalid price";
      case TRADE_RETCODE_INVALID_STOPS:
         return "Invalid stops";
      case TRADE_RETCODE_TRADE_DISABLED:
         return "Trade disabled";
      case TRADE_RETCODE_MARKET_CLOSED:
         return "Market closed";
      case TRADE_RETCODE_NO_MONEY:
         return "Not enough money";
      case TRADE_RETCODE_PRICE_CHANGED:
         return "Price changed";
      case TRADE_RETCODE_PRICE_OFF:
         return "No quotes";
      case TRADE_RETCODE_INVALID_EXPIRATION:
         return "Invalid order expiration";
      case TRADE_RETCODE_ORDER_CHANGED:
         return "Order state changed";
      case TRADE_RETCODE_TOO_MANY_REQUESTS:
         return "Too many requests";
      case TRADE_RETCODE_NO_CHANGES:
         return "No changes";
      case TRADE_RETCODE_SERVER_DISABLES_AT:
         return "Autotrading disabled by server";
      case TRADE_RETCODE_CLIENT_DISABLES_AT:
         return "Autotrading disabled by client";
      case TRADE_RETCODE_LOCKED:
         return "Request locked for processing";
      case TRADE_RETCODE_FROZEN:
         return "Order or position frozen";
      case TRADE_RETCODE_INVALID_FILL:
         return "Invalid fill type";
      case TRADE_RETCODE_CONNECTION:
         return "No connection";
      case TRADE_RETCODE_ONLY_REAL:
         return "Only real accounts allowed";
      case TRADE_RETCODE_LIMIT_ORDERS:
         return "Orders limit reached";
      case TRADE_RETCODE_LIMIT_VOLUME:
         return "Volume limit reached";
      case TRADE_RETCODE_INVALID_ORDER:
         return "Invalid order type";
      case TRADE_RETCODE_POSITION_CLOSED:
         return "Position already closed";
      default:
         return "Unknown error " + IntegerToString(error_code);
      }
   }
   void RecordFailedAttempt(int magicNumber, ENUM_TIMEFRAMES tf, ENUM_ORDER_TYPE orderType)
   {
      datetime currentBarTime = iTime(_Symbol, tf, 0);

      // Tìm slot trống hoặc slot cũ để ghi đè
      int insertIndex = -1;
      for (int i = 0; i < ArraySize(lastFailedAttempts); i++)
      {
         // Nếu đã có record cho cây nến này rồi thì không cần thêm
         if (lastFailedAttempts[i].barTime == currentBarTime &&
             lastFailedAttempts[i].magicNumber == magicNumber &&
             lastFailedAttempts[i].timeframe == tf &&
             lastFailedAttempts[i].orderType == orderType)
         {
            return;
         }

         // Tìm slot cũ nhất để ghi đè (cây nến cũ)
         if (lastFailedAttempts[i].barTime < currentBarTime)
         {
            insertIndex = i;
            break;
         }
      }

      // Nếu không tìm thấy slot cũ, thêm mới vào mảng
      if (insertIndex == -1)
      {
         insertIndex = ArraySize(lastFailedAttempts);
         ArrayResize(lastFailedAttempts, insertIndex + 1);
      }

      lastFailedAttempts[insertIndex].barTime = currentBarTime;
      lastFailedAttempts[insertIndex].magicNumber = magicNumber;
      lastFailedAttempts[insertIndex].timeframe = tf;
      lastFailedAttempts[insertIndex].orderType = orderType;

      Print(" Recorded failed attempt: ", EnumToString(orderType),
            " at ", TimeToString(currentBarTime), " TF:", TfToStr(tf), " Magic:", magicNumber);
   }

   //+------------------------------------------------------------------+
   //|  NEW: Get multiplier from GlobalVariable by magic number       |
   //+------------------------------------------------------------------+
   double GetMultiplierFromGlobal(int magicNumber)
   {
      // Tạo key theo format: multiplier_{magic_number}
      //  MUST match ordercheck.mq5 ParseMultiplierConfig key format!
      string key = "multiplier_" + IntegerToString(magicNumber);

      // Kiểm tra GlobalVariable có tồn tại không
      if (!GlobalVariableCheck(key))
      {
         // Chưa được set từ OrderCheck → Dùng default
         Print(" GlobalVariable ", key, " not found - using default 1.0");
         return 1.0;
      }

      // Đọc giá trị từ GlobalVariable
      double multiplier = GlobalVariableGet(key);

      // Validate giá trị hợp lệ
      if (multiplier <= 0.0 || multiplier > 100.0)
      {
         Print(" Invalid multiplier from GlobalVariable: ", multiplier, " for magic ", magicNumber, " (key: ", key, ")");
         return 1.0; // Safe default
      }

      Print(" Got multiplier from GlobalVariable[", key, "] = ", multiplier);
      return multiplier;
   }

   //+------------------------------------------------------------------+
   //|  Set bot info GlobalVariable for ordercheck discovery         |
   //| Stores separate GlobalVariables for each field since MQL5       |
   //| GlobalVariables can only store doubles                          |
   //+------------------------------------------------------------------+
   void SetBotInfoGlobalVariable(int magicNumber, string symbol, ENUM_TIMEFRAMES timeframe,
                                 double risk, double lotThreshold)
   {
      // Create base key: bot_info_{magic_number}
      string baseKey = "bot_info_" + IntegerToString(magicNumber);

      // Create companion keys for each field
      string symbolKey = baseKey + "_sym";
      string tfKey = baseKey + "_tf";
      string riskKey = baseKey + "_risk";
      string lotKey = baseKey + "_lot";

      // Store timestamp to track when bot registered
      string tsKey = baseKey + "_ts";

      // Encode symbol as double (won't work perfectly, use string-based approach)
      // Actually, we'll use a simpler approach: store magic as non-zero value
      // and use the key name pattern for detection

      // Set base marker (any non-zero value indicates this bot is registered)
      GlobalVariableSet(baseKey, 1.0);

      // Since GlobalVariable only stores doubles, we'll encode info in comments
      // But we need a better solution. Let's use file-based storage or DB
      // For now, we'll just mark the bot as registered and log it

      // Try to encode essential info: we'll use separate variables
      // Symbol: we'll store a hash or use a workaround
      // For prototyping, store in strings using a global comment

      // Actually simplest: just mark bot active, ordercheck can scan positions to get details
      GlobalVariableSet(symbolKey, 0.0); // Placeholder - can't store string in GlobalVariable
      GlobalVariableSet(tfKey, (double)timeframe);
      GlobalVariableSet(riskKey, risk);
      GlobalVariableSet(lotKey, lotThreshold);
      GlobalVariableSet(tsKey, (double)TimeCurrent());

      Print(" Bot info registered: magic=", magicNumber, " symbol=", symbol, " tf=", TfToStr(timeframe),
            " risk=", risk, " lot_threshold=", lotThreshold, "version=1.0");
   }

   //+------------------------------------------------------------------+
   //|  Convert ENUM_TIMEFRAMES to string (reusable, no recursion)    |
   //+------------------------------------------------------------------+
   string TfToString(ENUM_TIMEFRAMES tf)
   {
      switch (tf)
      {
      case PERIOD_M1:
         return "M1";
      case PERIOD_M5:
         return "M5";
      case PERIOD_M15:
         return "15m";
      case PERIOD_M30:
         return "30m";
      case PERIOD_H1:
         return "H1";
      case PERIOD_H4:
         return "H4";
      case PERIOD_D1:
         return "D1";
      case PERIOD_W1:
         return "W1";
      case PERIOD_MN1:
         return "MN1";
      default:
         return "Unknown";
      }
   }

   //+------------------------------------------------------------------+
   //|  Fast comment generation with pre-converted tfStr              |
   //|  Use this when tfStr is already available to avoid re-conversion |
   //+------------------------------------------------------------------+
   double CalculateLotSize(double entryPrice, double stopLoss, double riskMoney)
   {
      if (stopLoss <= 0 || entryPrice <= 0 || stopLoss == entryPrice)
         return 0.0;
      double pointValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double pointSize = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

      if (pointValue <= 0 || pointSize <= 0 || riskMoney <= 0)
         return 0.0;

      double pipDistance = MathAbs(entryPrice - stopLoss) / pointSize;

      if (pipDistance <= 0)
         return 0.0;

      double lotSize = riskMoney / (pipDistance * pointValue);

      double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

      lotSize = NormalizeDouble(MathRound(lotSize / lotStep) * lotStep, 2);
      lotSize = lotSize * s_multiplier;

      lotSize = fmax(lotSize, minLot);

      return lotSize;
   }
   double CalculateLotSizeUseBalance(double entryPrice, double stopLoss, double riskPercent, int magicNumber)
   {
      if (stopLoss <= 0 || entryPrice <= 0 || stopLoss == entryPrice || riskPercent <= 0)
         return 0.0;
      // Lấy balance của account
      double accountBalance = AccountInfoDouble(ACCOUNT_BALANCE);

      // Tính riskMoney dựa trên balance và phần trăm rủi ro
      double riskMoney = accountBalance * (riskPercent / 100.0);

      double pointValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double pointSize = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

      if (pointValue <= 0 || pointSize <= 0 || riskMoney <= 0)
         return 0.0;

      double pipDistance = MathAbs(entryPrice - stopLoss) / pointSize;

      if (pipDistance <= 0)
         return 0.0;

      double lotSize = riskMoney / (pipDistance * pointValue);

      double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
      double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

      // Chuẩn hóa lot size theo lot step
      lotSize = NormalizeDouble(MathRound(lotSize / lotStep) * lotStep, 2);
      lotSize = lotSize * s_multiplier; // Sử dụng biến s_multiplier để điều chỉnh lot size
      // Đảm bảo lot size nằm trong giới hạn cho phép
      lotSize = fmax(lotSize, minLot);

      return lotSize;
   }
   double CalculateRange(ENUM_TIMEFRAMES tf, int N, int shift)
   {
      int highestIndex = iHighest(_Symbol, tf, MODE_HIGH, N, shift);
      double maxHigh = iHigh(_Symbol, tf, highestIndex);
      int lowestIndex = iLowest(_Symbol, tf, MODE_LOW, N, shift);
      double minLow = iLow(_Symbol, tf, lowestIndex);
      double range = maxHigh - minLow;
      Print(range);
      return range;
   }
   double calculateLotByVolatilityRange(double range, double atr, double baseLot,
                                        double rangeMultiplierHigh, double rangeMultiplierLow,
                                        double lotScaleUp, double lotScaleDown, double lot_min_cap)
   {
      double lot = baseLot;
      if (range > atr * rangeMultiplierHigh)
         lot = baseLot * lotScaleUp;
      else if (range < atr * rangeMultiplierLow)
         lot = baseLot * lotScaleDown;
      else
         lot = baseLot;

      if (lot < lot_min_cap)
         lot = lot_min_cap;
      double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

      lot = NormalizeDouble(MathRound(lot / lotStep) * lotStep, 2);
      lot = fmax(lot, minLot);

      return lot;
   }

   void TryOpenOrderByTierRisk(ENUM_ORDER_TYPE orderType, bool EnableDynamicRisk, double stop_loss,
                               double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption,
                               ENUM_TIMEFRAMES tf, int &consecutiveWins, int MaxConsecutiveWins,
                               double baseLossPerTrade, double RiskIncreasePercent,
                               double &currentLossPerTrade)
   {
      if (HasFailedInCurrentBar(magicNumber, tf, orderType))
      {
         return;
      }

      UpdateDynamicRisk(EnableDynamicRisk, magicNumber, consecutiveWins, MaxConsecutiveWins,
                        baseLossPerTrade, RiskIncreasePercent, currentLossPerTrade);

      double entryPrice;
      if (orderType == ORDER_TYPE_BUY)
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }
      else
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }

      double CSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double riskDistance = MathAbs(entryPrice - stop_loss);

      double qty = CalculateLotSize(entryPrice, stop_loss, currentLossPerTrade);

      if (qty > 0.0)
         ExecuteOrders(orderType, qty, stop_loss, entryPrice, lotThreshold,
                       magicNumber, currentLossPerTrade, tf, TfToString(tf));
   }
   void TryOpenOrderByVolatilityRange(ENUM_ORDER_TYPE orderType, double stop_loss, double lotThreshold, int magicNumber, double atr, double baseLot,
                                      double rangeMultiplierHigh, double rangeMultiplierLow,
                                      double lotScaleUp, double lotScaleDown, double lot_min_cap, int n, OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf)
   {
      double entryPrice;
      double range;
      if (HasFailedInCurrentBar(magicNumber, tf, orderType))
      {
         return;
      }

      if (orderType == ORDER_TYPE_BUY)
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
         {
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
            range = CalculateRange(tf, n, 0); // Recalculate range based on the current open
         }
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
         {
            entryPrice = iClose(_Symbol, tf, 1);
            range = CalculateRange(tf, n, 1); // Recalculate range based on the previous close
         }
         else
         {
            entryPrice = iOpen(_Symbol, tf, 0);
            range = CalculateRange(tf, n, 0);
         }
      }
      else
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
         {
            range = CalculateRange(tf, n, 0); // Recalculate range based on the current open
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         }
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
         {
            range = CalculateRange(tf, n, 1); // Recalculate range based on the previous close
            entryPrice = iClose(_Symbol, tf, 1);
         }
         else
         {
            range = CalculateRange(tf, n, 0); // Recalculate range based on the current open
            entryPrice = iOpen(_Symbol, tf, 0);
         }
      }

      double CSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      // Example initialization for required variables (replace with your logic as needed)
      double qty = calculateLotByVolatilityRange(range, atr, baseLot, rangeMultiplierHigh, rangeMultiplierLow, lotScaleUp, lotScaleDown, lot_min_cap);

      // Log Risk Money for Volatility Range strategy
      double riskDistance = MathAbs(entryPrice - stop_loss);
      double riskMoneyVol = qty * riskDistance * CSize;

      if (qty > 0.0 && stop_loss > 0.0)
         ExecuteOrders(orderType, qty, stop_loss, entryPrice, lotThreshold, magicNumber, riskMoneyVol, tf, TfToString(tf));
   }

   void TryOpenOrderBuymultiplierLotsize(ENUM_ORDER_TYPE orderType, double stop_loss, double riskMoney, double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf, double multiplierLotsize)
   {
      double entryPrice;
      if (HasFailedInCurrentBar(magicNumber, tf, orderType))
      {
         return;
      }

      if (orderType == ORDER_TYPE_BUY)
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }
      else
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }
      double CSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double riskDistance = MathAbs(entryPrice - stop_loss);
      //+------------------------------------------------------------------+
      //|  UPDATED: Use GlobalVariable multiplier if param = 0          |
      //+------------------------------------------------------------------+
      double effectiveMultiplier = (multiplierLotsize <= 0.0)
                                       ? GetMultiplierFromGlobal(magicNumber)
                                       : multiplierLotsize;

      double qty = CalculateLotSize(entryPrice, stop_loss, riskMoney) * effectiveMultiplier;
      if (qty > 0.0)
         ExecuteOrders(orderType, qty, stop_loss, entryPrice, lotThreshold, magicNumber, riskMoney, tf, TfToString(tf));
   }

   void UpdateDynamicRisk(int magicNumber, bool doubleOnWin)
   {
      bool hasOpenPosition = false;
      for (int i = 0; i < PositionsTotal(); i++)
      {
         if (PositionGetTicket(i) > 0 &&
             PositionGetString(POSITION_SYMBOL) == _Symbol &&
             PositionGetInteger(POSITION_MAGIC) == magicNumber)
         {
            hasOpenPosition = true;
            lastPositionTicket = PositionGetTicket(i);
            break;
         }
      }

      if (!hasOpenPosition && lastPositionTicket > 0)
      {
         HistorySelectByPosition(lastPositionTicket);
         int deals = HistoryDealsTotal();

         if (deals > 0)
         {
            ulong dealTicket = HistoryDealGetTicket(deals - 1);
            if (dealTicket > 0)
            {
               double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);

               if (doubleOnWin)
               {
                  if (profit > 0)
                  {
                     s_multiplier = 2.0;
                     Print("Use lotsize Anti-Martingale, multiplier: ", s_multiplier);
                  }
                  else // Loss → reset
                     s_multiplier = 1.0;
               }
               else
               {
                  if (profit > 0) // Win → reset
                     s_multiplier = 1.0;
                  else
                  {
                     s_multiplier = 2.0;
                     Print("Use lotsize Martingale, multiplier: ", s_multiplier);

                  } // Loss → x2
               }
            }
         }

         lastPositionTicket = 0; // Reset
      }
   }
   void UpdateDynamicRisk(bool EnableDynamicRisk, int MagicNumber, int &consecutiveWins, int MaxConsecutiveWins,
                          double baseLossPerTrade, double RiskIncreasePercent, double &currentLossPerTrade)
   {
      if (!EnableDynamicRisk)
      {
         return;
      }

      if (HistorySelect(0, TimeCurrent()))
      {
         int totalDeals = HistoryDealsTotal();
         for (int i = totalDeals - 1; i >= 0; i--)
         {
            ulong dealTicket = HistoryDealGetTicket(i);
            if (dealTicket > 0)
            {
               string dealSymbol = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
               long dealMagic = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
               long dealEntry = HistoryDealGetInteger(dealTicket, DEAL_ENTRY);

               if (dealSymbol == _Symbol && dealMagic == MagicNumber && dealEntry == DEAL_ENTRY_OUT)
               {
                  double profit = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);

                  if (profit > 0) // Win
                  {
                     if (consecutiveWins >= MaxConsecutiveWins)
                     {
                        consecutiveWins = 0;
                        currentLossPerTrade = baseLossPerTrade;
                        Print("Max wins reached - Risk reset to base: ", currentLossPerTrade);
                     }
                     else
                     {
                        consecutiveWins++;
                        currentLossPerTrade = currentLossPerTrade * (1 + (RiskIncreasePercent / 100.0));

                        double increasePercent = (currentLossPerTrade / baseLossPerTrade - 1) * 100;
                        Print("WIN #", consecutiveWins, " - Risk increased to: ", currentLossPerTrade,
                              " (", NormalizeDouble(increasePercent, 1), "% from base)");
                     }
                  }
                  else
                  {
                     consecutiveWins = 0;
                     currentLossPerTrade = baseLossPerTrade;
                     Print("LOSS - Risk reset to base: ", currentLossPerTrade);
                  }

                  break; // Đã xử lý deal cuối cùng -> thoát vòng lặp
               }
            }
         }
      }
   }

   void TryOpenOrderUseLotSizeUseBalance(ENUM_ORDER_TYPE orderType, double stop_loss, double riskPercent, double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf)
   {
      double entryPrice;
      if (HasFailedInCurrentBar(magicNumber, tf, orderType))
      {
         return;
      }

      if (orderType == ORDER_TYPE_BUY)
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }
      else
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }
      double CSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double riskDistance = MathAbs(entryPrice - stop_loss);
      double qty = CalculateLotSizeUseBalance(entryPrice, stop_loss, riskPercent, magicNumber);
      if (qty > 0.0)
         ExecuteOrders(orderType, qty, stop_loss, entryPrice, lotThreshold, magicNumber, riskPercent, tf, TfToString(tf));
   }
   bool ExecuteOrders(ENUM_ORDER_TYPE orderType, double qty, double stop_loss, double entryPrice,
                      double lotThreshold, int magicNumber, double riskMoney, ENUM_TIMEFRAMES tf, string tfStr)
   {
      // Use tfStr directly (always passed from caller)
      string actualTfStr = tfStr;

      // Build comment prefix once (reused for all orders)
      string bsStr = (orderType == ORDER_TYPE_BUY) ? "B" : "S";
      string commentPrefix = IntegerToString(magicNumber) + "_" +
                             DoubleToString(riskMoney, 0) + "_";

      trade.SetExpertMagicNumber(magicNumber);
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  CHECK LOT THRESHOLD - Nếu qty > lotThreshold thì skip order
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lotThreshold > 0 && qty > lotThreshold)
      {
         Print(" SKIP ORDER: Calculated lot (", qty, ") exceeds lotThreshold (", lotThreshold, ")");
         Print("   Magic:", magicNumber, " | Symbol:", _Symbol, " | TF:", TfToStr(tf));
         RecordFailedAttempt(magicNumber, tf, orderType);
         return false;
      }
      if (!MathIsValidNumber(qty) || qty <= 0)
      {
         Print("⚠️ ExecuteOrders aborted: invalid qty = ", qty);
         RecordFailedAttempt(magicNumber, tf, orderType);
         return false;
      }
      double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      if (step <= 0)
         step = 0.01;

      double staticMax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
      if (staticMax <= 0)
         staticMax = qty;

      //  LOCAL VARIABLES - Reset mỗi lần gọi ExecuteOrders
      double largestAccepted = 0;
      double smallestRejected = 0;
      double realMinLot = 0;
      double lastSuccessfulLot = 0;

      double originalQty = qty;
      double totalPlaced = 0;

      Print(" START ExecuteOrders");
      Print("   Original qty: ", originalQty);
      Print("   staticMax: ", staticMax);
      Print("   step: ", step);

      int safety = 0;
      int successfulOrderCount = 0; // Đếm số lệnh thành công (không tính lệnh thất bại)
      bool allSuccess = true;
      int consecutiveErrors = 0;

      while (qty > 0)
      {
         safety++;

         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         //  TÍNH maxLot
         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         double maxLot;

         if (safety == 1)
         {
            //  LẦN ĐẦU TIÊN: Luôn thử toàn bộ qty
            maxLot = qty;
            Print(" First attempt: trying full qty = ", qty);
         }
         else if (largestAccepted > 0)
         {
            // Đã học được limit trong LỆNH NÀY
            maxLot = largestAccepted;
         }
         else if (smallestRejected > 0)
         {
            // Đã bị reject → chia 2
            maxLot = smallestRejected / 2.0;
            maxLot = NormalizeVolumeByStep(_Symbol, maxLot);
         }
         else
         {
            // Fallback
            maxLot = staticMax;
         }

         if (safety % 10 == 0)
         {
            Print("🔍 Loop #", safety, " | qty=", qty, " | maxLot=", maxLot,
                  " | largestAccepted=", largestAccepted,
                  " | smallestRejected=", smallestRejected,
                  " | realMinLot=", realMinLot);
         }

         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         //  TÍNH lotToTrade
         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         double lotToTrade = MathMin(qty, maxLot);
         lotToTrade = NormalizeVolumeByStep(_Symbol, lotToTrade);

         if (lotToTrade <= 0)
         {
            Print(" lotToTrade = 0, qty=", qty);
            break;
         }

         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         //  TÍNH REMAINDER VÀ COMBINE NẾU CẦN
         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         double remainder = qty - lotToTrade;
         remainder = NormalizeDouble(remainder, 2);

         //  CASE 1: remainder < realMinLot → Combine vào lệnh này
         if (remainder > 0 && remainder < realMinLot && realMinLot > 0)
         {
            double combined = lotToTrade + remainder;
            combined = NormalizeVolumeByStep(_Symbol, combined);

            if (combined <= maxLot * 1.02)
            {
               lotToTrade = combined;
               Print(" Combined final remainder (< realMinLot): ", remainder, " → ", lotToTrade);
            }
         }
         //  CASE 2: remainder rất nhỏ (< 2*step) → Combine luôn
         else if (remainder > 0 && remainder < step * 2)
         {
            double combined = lotToTrade + remainder;
            combined = NormalizeVolumeByStep(_Symbol, combined);

            if (combined <= maxLot * 1.02)
            {
               lotToTrade = combined;
               Print(" Combined tiny remainder (< 2*step): ", remainder, " → ", lotToTrade);
            }
         }

         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         //  GỬI LỆNH
         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         string comment = commentPrefix +
                          DoubleToString(entryPrice, _Digits) + "_" +
                          actualTfStr + "_" +
                          bsStr + IntegerToString(successfulOrderCount + 1);

         bool ok;
         if (orderType == ORDER_TYPE_BUY)
         {
            ulong timeStart = GetMicrosecondCount();

            ok = trade.Buy(lotToTrade, _Symbol, entryPrice, stop_loss, 0, comment);
            ulong elapsed = GetMicrosecondCount() - timeStart;
            Print(" OrderSend took ", elapsed / 1000, "ms");
         }
         else
            ok = trade.Sell(lotToTrade, _Symbol, entryPrice, stop_loss, 0, comment);

         uint rc = trade.ResultRetcode();

         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         //  XỬ LÝ KẾT QUẢ THÀNH CÔNG
         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         if (ok && rc == TRADE_RETCODE_DONE)
         {
            consecutiveErrors = 0;
            successfulOrderCount++; // Tăng counter lệnh thành công

            //  CHỈ học largestAccepted khi lotToTrade < originalQty
            if (lotToTrade < originalQty && lotToTrade > largestAccepted)
            {
               largestAccepted = lotToTrade;
               Print(" Learned largestAccepted = ", largestAccepted, " (was limited)");
            }

            //  Học realMinLot: Lot nhỏ nhất từng SUCCESS
            if (realMinLot == 0 || lotToTrade < realMinLot)
            {
               realMinLot = lotToTrade;
               Print(" LEARNED realMinLot = ", realMinLot, " (from successful order)");
            }

            lastSuccessfulLot = lotToTrade;

            qty -= lotToTrade;
            totalPlaced += lotToTrade;

            qty = NormalizeDouble(qty, 2);
            totalPlaced = NormalizeDouble(totalPlaced, 2);

            Print("FILLED ", lotToTrade, " | ", totalPlaced, "/", originalQty, " | remain: ", qty);

            continue;
         }

         allSuccess = false;

         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         //  XỬ LÝ LỖI REJECT
         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         if (rc == TRADE_RETCODE_INVALID_VOLUME || rc == TRADE_RETCODE_REJECT)
         {
            Print(" REJECTED lot=", lotToTrade, " rc=", rc);

            if (smallestRejected == 0 || lotToTrade < smallestRejected)
            {
               smallestRejected = lotToTrade;
               Print(" smallestRejected = ", smallestRejected);
            }

            Sleep(50);
            continue;
         }

         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         //  XỬ LÝ LỖI NGHIÊM TRỌNG
         // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         Print(" ERROR: rc=", rc, " - ", trade.ResultRetcodeDescription());

         // LỖI VỀ STOP LOSS - KHÔNG THỬ LẠI
         if (rc == TRADE_RETCODE_INVALID_STOPS || rc == TRADE_RETCODE_INVALID_PRICE)
         {
            Print("    Stop loss error - aborting execution");
            RecordFailedAttempt(magicNumber, tf, orderType);
            break;
         }

         // LỖI NGHIÊM TRỌNG - Thử chia nhỏ
         if (rc == TRADE_RETCODE_ERROR ||
             rc == TRADE_RETCODE_SERVER_DISABLES_AT ||
             rc == TRADE_RETCODE_TOO_MANY_REQUESTS)
         {
            Print("    Critical error, will try to split order smaller");
            RecordFailedAttempt(magicNumber, tf, orderType);

            if (smallestRejected == 0)
            {
               smallestRejected = lotToTrade;
               Print("   → Marking as rejected, will retry with smaller size");
               Sleep(50);
               continue;
            }
            else
            {
               break;
            }
         }

         // Các lỗi khác → thử lại tối đa 3 lần
         consecutiveErrors++;

         if (consecutiveErrors > 3)
         {
            Print("    Max consecutive errors (", consecutiveErrors, ") - aborting");
            RecordFailedAttempt(magicNumber, tf, orderType);
            break;
         }

         Print("    Retry ", consecutiveErrors, "/3 after 10ms...");
         Sleep(10);
         continue;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  XỬ LÝ PHẦN DƯ (NẾU CÒN)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (qty > 0)
      {
         Print("━━━━━━━━━━━━━━━━━━━━━━━━━━");
         Print(" Remainder: ", qty);

         //  Try to combine remainder with last successful lot
         if (lastSuccessfulLot > 0 && qty < step * 5)
         {
            double combined = lastSuccessfulLot + qty;
            combined = NormalizeVolumeByStep(_Symbol, combined);

            double finalMaxLot = (largestAccepted > 0) ? largestAccepted : staticMax;
            double overagePercent = ((combined - finalMaxLot) / finalMaxLot) * 100.0;

            bool allowTryCombined = (combined <= finalMaxLot) ||
                                    (combined > finalMaxLot && overagePercent <= 2.0);

            if (allowTryCombined)
            {
               Print("    Trying to combine last order + remainder: ", lastSuccessfulLot,
                     " + ", qty, " = ", combined,
                     (combined > finalMaxLot ? " (slightly over limit)" : ""));

               string comment = commentPrefix +
                                DoubleToString(entryPrice, _Digits) + "_" +
                                actualTfStr + "_" +
                                bsStr + IntegerToString(successfulOrderCount + 1);

               bool ok;
               if (orderType == ORDER_TYPE_BUY)
                  ok = trade.Buy(combined, _Symbol, entryPrice, stop_loss, 0, comment);
               else
                  ok = trade.Sell(combined, _Symbol, entryPrice, stop_loss, 0, comment);

               if (ok && trade.ResultRetcode() == TRADE_RETCODE_DONE)
               {
                  successfulOrderCount++;
                  totalPlaced += combined;
                  totalPlaced = NormalizeDouble(totalPlaced, 2);
                  qty = 0;
                  Print("    Combined order placed: ", combined);
               }
               else
               {
                  Print("    Combined order FAILED: rc=", trade.ResultRetcode());
               }
            }
            else
            {
               Print("    Combined (", combined, ") exceeds maxLot (", finalMaxLot, ") by ",
                     NormalizeDouble(overagePercent, 2), "% - too much overage");
            }
         }

         if (qty > 0 && qty < realMinLot)
         {
            double lotToTry = 0;

            if (realMinLot > 0)
            {
               lotToTry = MathCeil(qty / realMinLot) * realMinLot;
               lotToTry = NormalizeVolumeByStep(_Symbol, lotToTry);
               Print("   Using learned realMinLot: ", realMinLot, " → trying: ", lotToTry);
            }
            else
            {
               double candidates[] = {1.0, 0.5, 0.1, 0.01};

               for (int i = 0; i < ArraySize(candidates); i++)
               {
                  double candidate = candidates[i];
                  lotToTry = MathCeil(qty / candidate) * candidate;
                  lotToTry = NormalizeVolumeByStep(_Symbol, lotToTry);

                  double finalMaxLot = (largestAccepted > 0) ? largestAccepted : staticMax;

                  if (lotToTry <= finalMaxLot && lotToTry >= qty)
                  {
                     Print("   Trying candidate minLot: ", candidate, " → lot: ", lotToTry);
                     break;
                  }
               }
            }

            if (lotToTry > 0)
            {
               double finalMaxLot = (largestAccepted > 0) ? largestAccepted : staticMax;

               if (lotToTry <= finalMaxLot)
               {
                  string comment = commentPrefix +
                                   DoubleToString(entryPrice, _Digits) + "_" +
                                   actualTfStr + "_" +
                                   bsStr + IntegerToString(successfulOrderCount + 1);

                  bool ok;
                  if (orderType == ORDER_TYPE_BUY)
                     ok = trade.Buy(lotToTry, _Symbol, entryPrice, stop_loss, 0, comment);
                  else
                     ok = trade.Sell(lotToTry, _Symbol, entryPrice, stop_loss, 0, comment);

                  if (ok && trade.ResultRetcode() == TRADE_RETCODE_DONE)
                  {
                     successfulOrderCount++;
                     totalPlaced += lotToTry;
                     totalPlaced = NormalizeDouble(totalPlaced, 2);
                     qty = 0;
                     Print("    Final order placed: ", lotToTry);
                  }
                  else
                  {
                     Print("    Final order FAILED: rc=", trade.ResultRetcode());
                  }
               }
               else
               {
                  Print("    lotToTry (", lotToTry, ") > maxLot (", finalMaxLot, ")");
               }
            }
         }
         else if (qty > 0)
         {
            Print("    Large remainder still exists - loop ended unexpectedly");
            Print("   This shouldn't happen - check for infinite loop protection");
         }

         Print("━━━━━━━━━━━━━━━━━━━━━━━━━━");
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  FINAL SUMMARY
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (qty > 0)
      {
         Print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
         Print(" INCOMPLETE: ", qty, " lot remaining");
         Print("   Placed: ", totalPlaced, "/", originalQty);
         Print("   Percentage: ", NormalizeDouble(totalPlaced / originalQty * 100, 2), "%");
         Print("   State: accepted=", largestAccepted,
               " rejected=", smallestRejected,
               " minLot=", realMinLot);
         Print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
         return false;
      }

      Print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      Print(" SUCCESS: ", totalPlaced, " in ", safety, " orders");
      Print("   Target: ", originalQty);
      Print("   Filled: ", totalPlaced, " (", NormalizeDouble(totalPlaced / originalQty * 100, 2), "%)");
      Print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      return allSuccess;
   }

   void TryOpenOrder(ENUM_ORDER_TYPE orderType, double stop_loss, double riskMoney,
                     double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption,
                     ENUM_TIMEFRAMES tf)
   {
      // Kiểm tra xem đã fail trong cây nến này chưa
      if (HasFailedInCurrentBar(magicNumber, tf, orderType))
      {
         // Print(" Skip order attempt - already failed in this bar");
         return;
      }

      double entryPrice;
      if (orderType == ORDER_TYPE_BUY)
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }
      else
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, tf, 1);
         else
            entryPrice = iOpen(_Symbol, tf, 0);
      }

      double CSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double riskDistance = MathAbs(entryPrice - stop_loss);
      double eff = GetMultiplierFromGlobal(magicNumber);
      // Print(" Using lot size multiplier: ", eff, " for magic ", magicNumber);
      double qty = CalculateLotSize(entryPrice, stop_loss, riskMoney) * eff;
      if (lotThreshold > 0 && qty > lotThreshold)
      {
         Print("Calculated lot (", qty, ") is above lotThreshold (", lotThreshold, ") - no order placed");
         return;
      }
      if (qty > 0.0)
      {
         bool result = ExecuteOrders(orderType, qty, stop_loss, entryPrice,
                                     lotThreshold, magicNumber, riskMoney, tf, TfToString(tf));
         // ExecuteOrders đã tự động record failed attempt nếu thất bại
      }
   }
   bool SafeCloseTicketOncePerSecond(ulong ticket,
                                     int magicNumber,
                                     double riskMoney,
                                     double lotThreshold,
                                     ENUM_TIMEFRAMES tf,
                                     ENUM_POSITION_TYPE posTypeWanted)
   {
      static ulong lastTicketClosed = 0;
      static datetime lastCloseTime = 0;

      datetime nowTime = TimeCurrent();

      if (ticket == lastTicketClosed && nowTime == lastCloseTime)
      {

         return false;
      }
      double entryPrice = 0.0;
      if (PositionSelectByTicket(ticket))
      {
         entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      }

      // Gửi close thật sự
      double closePrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      string closeComment = IntegerToString(magicNumber) + "_" +
                            DoubleToString(riskMoney, 0) + "_" +
                            DoubleToString(closePrice, _Digits) + "_" +
                            TfToStr(tf) + "_C";
      bool ok = trade.PositionClose(ticket, closeComment);

      if (!ok)
      {
         Print(" Close failed ",
               (posTypeWanted == POSITION_TYPE_BUY ? "B" : "S"),
               " ticket=", ticket, " err=", GetLastError());
         return false;
      }

      // ghi nhớ
      lastTicketClosed = ticket;
      lastCloseTime = nowTime;

      return true;
   }

   bool CloseOrders(ENUM_POSITION_TYPE typeToClose,
                    int magicNumber,
                    double riskMoney,
                    double lotThreshold,
                    ENUM_TIMEFRAMES tf)
   {
      bool closed_any = false;
      string needle = MakeNeedleFromTf(tf);

      for (int i = PositionsTotal() - 1; i >= 0; --i)
      {
         ulong ticket = PositionGetTicket(i);
         if (ticket == 0)
            continue;
         if (!PositionSelectByTicket(ticket))
            continue;

         if (PositionGetString(POSITION_SYMBOL) != _Symbol)
            continue;
         if ((int)PositionGetInteger(POSITION_MAGIC) != magicNumber)
            continue;
         if ((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) != typeToClose)
            continue;

         string cmt = PositionGetString(POSITION_COMMENT);
         if (StringFind(cmt, needle) == -1)
            continue;

         // dùng guard
         bool ok = SafeCloseTicketOncePerSecond(ticket,
                                                magicNumber,
                                                riskMoney,
                                                lotThreshold,
                                                tf,
                                                typeToClose);
         if (ok)
            closed_any = true;
      }
      return closed_any;
   }

   bool IsBarClosing(ENUM_TIMEFRAMES tf)
   {
      int stateIndex = GetOrCreateBarStateIndex(tf);

      datetime barTime = iTime(_Symbol, tf, 0);
      int periodSec = PeriodSeconds(tf);

      // Check nếu đang trong giây cuối của cây nến
      bool isClosingNow = (TimeCurrent() >= barTime + periodSec - 1);

      if (isClosingNow)
      {
         // Nếu đã xử lý cây nến này rồi
         if (barStates[stateIndex].lastBarTime == barTime &&
             barStates[stateIndex].lastClosingState)
         {
            return false;
         }

         // Chưa xử lý -> đánh dấu đã xử lý
         barStates[stateIndex].lastBarTime = barTime;
         barStates[stateIndex].lastClosingState = true;
         Print("🔚 Bar closing on ", TfToStr(tf), " at ", TimeToString(barTime));
         return true;
      }
      else
      {
         // Không phải giây cuối -> reset state
         barStates[stateIndex].lastClosingState = false;
      }

      return false;
   }
   // Hàm mới không lỗi chưa new bar đã vào
   bool IsNewBar(ENUM_TIMEFRAMES tf)
   {
      int stateIndex = GetOrCreateBarStateIndex(tf);
      datetime currentBarTime = iTime(_Symbol, tf, 0);

      if (barStates[stateIndex].lastBarTime == 0)
      {
         barStates[stateIndex].lastBarTime = currentBarTime;
         return false;
      }

      if (currentBarTime == barStates[stateIndex].lastBarTime)
         return false;

      barStates[stateIndex].lastBarTime = currentBarTime;
      return true;
   }

   // Hàm cũ lỗi chưa new bar đã vào
   // bool IsNewBar(ENUM_TIMEFRAMES tf)
   // {
   //    int stateIndex = GetOrCreateBarStateIndex(tf);

   //    datetime currentBarTime = iTime(_Symbol, tf, 0);

   //    if (currentBarTime == barStates[stateIndex].lastBarTime)
   //    {
   //       return false;
   //    }

   //    barStates[stateIndex].lastBarTime = currentBarTime;
   //    return true;
   // }

public:
   typedef void (*SignalHandlerFunction)(double price, double currentLow, double currentHigh, int shift);
   void OnTick(SignalHandlerFunction signalHandler, OrderEntryMode orderEntryOption, ENUM_TIMEFRAMES tf,
               int magicNumber = 0, double risk = 0, double lotThreshold = 0)
   {
      //  Register bot on first tick (one-time only)
      static bool bot_registered = false;
      if (!bot_registered && magicNumber > 0)
      {
         SetBotInfoGlobalVariable(magicNumber, _Symbol, tf, risk, lotThreshold);
         bot_registered = true;
      }

      if ((orderEntryOption == ENTRY_ATC && !IsBarClosing(tf)) ||
          (orderEntryOption != ENTRY_ATC && !IsNewBar(tf)))
         return;

      //  Xác định shift dựa trên orderEntryOption, nhưng chỉ sau khi cây nến hoàn thành
      int shift = (orderEntryOption == ENTRY_ATC) ? 0 : 1;
      double price = iClose(_Symbol, tf, shift);
      double currentLow = iLow(_Symbol, tf, shift);
      double currentHigh = iHigh(_Symbol, tf, shift);

      if (signalHandler != NULL)
         signalHandler(price, currentLow, currentHigh, shift);
   }
   string TfToStr(ENUM_TIMEFRAMES tf)
   {
      switch (tf)
      {
      case PERIOD_M1:
         return "M1";
      case PERIOD_M5:
         return "M5";
      case PERIOD_M15:
         return "15m";
      case PERIOD_M30:
         return "30m";
      case PERIOD_H1:
         return "H1";
      case PERIOD_H4:
         return "H4";
      case PERIOD_D1:
         return "D1";
      case PERIOD_W1:
         return "W1";
      case PERIOD_MN1:
         return "MN1";
      default:
         return "Unknown";
      }
   }
   bool HasPositionByMagic(const string symbol, const int magic, ENUM_POSITION_TYPE &outType)
   {
      for (int i = PositionsTotal() - 1; i >= 0; --i)
      {
         ulong ticket = PositionGetTicket(i);
         if (ticket == 0)
            continue;
         if (!PositionSelectByTicket(ticket))
            continue;
         if (PositionGetString(POSITION_SYMBOL) != symbol)
            continue;
         if ((int)PositionGetInteger(POSITION_MAGIC) != magic)
            continue;

         outType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         return true;
      }
      return false;
   }
   bool HasPositionTypeByMagic(const string symbol, const int magic, const ENUM_POSITION_TYPE type)
   {
      for (int i = PositionsTotal() - 1; i >= 0; --i)
      {
         ulong ticket = PositionGetTicket(i);
         if (ticket == 0)
            continue;
         if (!PositionSelectByTicket(ticket))
            continue;
         if (PositionGetString(POSITION_SYMBOL) != symbol)
            continue;
         if ((int)PositionGetInteger(POSITION_MAGIC) != magic)
            continue;
         if ((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) == type)
            return true;
      }
      return false;
   }
   string MakeNeedleFromTf(ENUM_TIMEFRAMES tf)
   {
      // ví dụ tf=M1 -> "M1", tf=H4 -> "H4"
      string tfStr = TfToStr(tf);
      return "_" + tfStr + "_";
   }
   bool HasPositionByMagicAndTf(const string symbol,
                                const int magic,
                                ENUM_TIMEFRAMES tf,
                                ENUM_POSITION_TYPE &outType)
   {
      string needle = MakeNeedleFromTf(tf);

      for (int i = PositionsTotal() - 1; i >= 0; --i)
      {
         ulong ticket = PositionGetTicket(i);
         if (ticket == 0)
            continue;
         if (!PositionSelectByTicket(ticket))
            continue;

         if (PositionGetString(POSITION_SYMBOL) != symbol)
            continue;
         if ((int)PositionGetInteger(POSITION_MAGIC) != magic)
            continue;

         string cmt = PositionGetString(POSITION_COMMENT);
         if (StringFind(cmt, needle) == -1)
            continue; // không phải lệnh của TF này

         outType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
         return true;
      }
      return false;
   }

   void CloseOrder(bool closeBuySignal, bool closeSellSignal,
                   double riskMoney, double lotThreshold, int magicNumber,
                   OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf)
   {
      ENUM_POSITION_TYPE t;
      if (!HasPositionByMagicAndTf(_Symbol, magicNumber, tf, t))
         return;

      string tfStr = TfToStr(tf);

      if (t == POSITION_TYPE_BUY && closeBuySignal)
      {
         bool ok = CloseOrders(POSITION_TYPE_BUY, magicNumber, riskMoney, lotThreshold, tf);
         if (ok)
            Print("Close BUY executed. magic=", magicNumber, ", tf=", tfStr);
         else
            Print("⬇Close BUY requested but nothing closed. magic=", magicNumber, ", tf=", tfStr);
      }
      else if (t == POSITION_TYPE_SELL && closeSellSignal)
      {
         bool ok = CloseOrders(POSITION_TYPE_SELL, magicNumber, riskMoney, lotThreshold, tf);
         if (ok)
            Print("Close SELL executed. magic=", magicNumber, ", tf=", tfStr);
         else
            Print("Close SELL requested but nothing closed. magic=", magicNumber, ", tf=", tfStr);
      }
   }

   void CloseOrderUseNewLotSize(bool doubleOnWin, bool closeBuySignal, bool closeSellSignal, double riskMoney, double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf)
   {
      ENUM_POSITION_TYPE t;
      if (!HasPositionByMagic(_Symbol, magicNumber, t))
         return;

      string tfStr = TfToStr(tf);

      if (t == POSITION_TYPE_BUY && closeBuySignal)
      {
         bool ok = CloseOrders(POSITION_TYPE_BUY, magicNumber, riskMoney, lotThreshold, tf);
         if (ok)
            Print("Close BUY executed. magic=", magicNumber, ", tf=", tfStr);
         else
            Print("⬇Close BUY requested but nothing closed. magic=", magicNumber, ", tf=", tfStr);
      }
      else if (t == POSITION_TYPE_SELL && closeSellSignal)
      {
         bool ok = CloseOrders(POSITION_TYPE_SELL, magicNumber, riskMoney, lotThreshold, tf);
         if (ok)
            Print("Close SELL executed. magic=", magicNumber, ", tf=", tfStr);
         else
            Print("Close SELL requested but nothing closed. magic=", magicNumber, ", tf=", tfStr);
      }
      UpdateDynamicRisk(magicNumber, doubleOnWin);
   }
   void OpenOrder(bool isBuySignal, bool isSellSignal, bool acceptBuy, bool acceptSell,
                  double riskMoney, double lotThreshold, int magicNumber,
                  OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf, double stoploss)
   {
      // const bool buyExists = HasPositionTypeByMagic(_Symbol, magicNumber, POSITION_TYPE_BUY);
      // const bool sellExists = HasPositionTypeByMagic(_Symbol, magicNumber, POSITION_TYPE_SELL);

      if (acceptBuy && isBuySignal /*&& !buyExists*/)
         TryOpenOrder(ORDER_TYPE_BUY, stoploss, riskMoney, lotThreshold, magicNumber, OrderEntryOption, tf);

      if (acceptSell && isSellSignal /*&& !sellExists*/)
         TryOpenOrder(ORDER_TYPE_SELL, stoploss, riskMoney, lotThreshold, magicNumber, OrderEntryOption, tf);
   }
   void OpenOrderBuymultiplierLotsize(bool isBuySignal, bool isSellSignal, bool acceptBuy, bool acceptSell, double riskMoney, double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf, double stoploss, double multiplierLotsize)
   {
      bool hasBuyPosition = false;
      bool hasSellPosition = false;

      for (int i = 0; i < PositionsTotal(); i++)
      {
         if (PositionGetTicket(i) > 0 &&
             PositionGetString(POSITION_SYMBOL) == _Symbol &&
             PositionGetInteger(POSITION_MAGIC) == magicNumber)
         {
            if (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
               hasBuyPosition = true;
            if (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_SELL)
               hasSellPosition = true;
         }
      }

      if (acceptBuy && isBuySignal && !hasBuyPosition)
      {
         TryOpenOrderBuymultiplierLotsize(ORDER_TYPE_BUY, stoploss, riskMoney, lotThreshold, magicNumber, OrderEntryOption, tf, multiplierLotsize);
      }

      // Chỉ mở lệnh SELL nếu chưa có lệnh SELL
      if (acceptSell && isSellSignal && !hasSellPosition)
      {
         TryOpenOrderBuymultiplierLotsize(ORDER_TYPE_SELL, stoploss, riskMoney, lotThreshold, magicNumber, OrderEntryOption, tf, multiplierLotsize);
      }
   }

   void OpenOrderUseLotSizeUseBalance(bool isBuySignal, bool isSellSignal, bool acceptBuy, bool acceptSell, double riskPercent, double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption, ENUM_TIMEFRAMES tf, double stoploss)
   {
      bool hasBuyPosition = false;
      bool hasSellPosition = false;

      for (int i = 0; i < PositionsTotal(); i++)
      {
         if (PositionGetTicket(i) > 0 &&
             PositionGetString(POSITION_SYMBOL) == _Symbol &&
             PositionGetInteger(POSITION_MAGIC) == magicNumber)
         {
            if (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
               hasBuyPosition = true;
            if (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_SELL)
               hasSellPosition = true;
         }
      }

      if (acceptBuy && isBuySignal && !hasBuyPosition)
      {
         TryOpenOrderUseLotSizeUseBalance(ORDER_TYPE_BUY, stoploss, riskPercent, lotThreshold, magicNumber, OrderEntryOption, tf);
      }

      if (acceptSell && isSellSignal && !hasSellPosition)
      {
         TryOpenOrderUseLotSizeUseBalance(ORDER_TYPE_SELL, stoploss, riskPercent, lotThreshold, magicNumber, OrderEntryOption, tf);
      }
   }

   void UpdateSLUpDownZero(double smiCurrent, double price, double currentLow, double currentHigh, double &stoploss, double &lowestPriceDuringRed, double &highestPriceDuringGreen)
   {
      if (smiCurrent < 0) // Sử dụng smiCurrent là giá trị kiểu double
      {
         if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
            lowestPriceDuringRed = currentLow;
         if (highestPriceDuringGreen != 0.0)
         {
            stoploss = MathMax(highestPriceDuringGreen, currentHigh);
            highestPriceDuringGreen = 0.0;
         }
      }
      else if (smiCurrent > 0) // Sử dụng smiCurrent là giá trị kiểu double
      {
         if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
            highestPriceDuringGreen = currentHigh;
         if (lowestPriceDuringRed != 0.0)
         {
            stoploss = MathMin(lowestPriceDuringRed, currentLow);
            lowestPriceDuringRed = 0.0;
         }
      }
   }
   void UpdateSLUpDownValue(double indicator1_value, double indicator2_value, double currentLow, double currentHigh, double &stoploss, double &lowestPriceDuringRed, double &highestPriceDuringGreen)
   {
      if (indicator1_value < indicator2_value) // Sử dụng indicator1_value và indicator2_value là giá trị kiểu double
      {
         if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
            lowestPriceDuringRed = currentLow;
         if (highestPriceDuringGreen != 0.0)
         {
            stoploss = MathMax(highestPriceDuringGreen, currentHigh);
            highestPriceDuringGreen = 0.0;
         }
      }
      if (indicator1_value > indicator2_value) // Sử dụng indicator1_value và indicator2_value là giá trị kiểu double
      {
         if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
            highestPriceDuringGreen = currentHigh;
         if (lowestPriceDuringRed != 0.0)
         {
            stoploss = MathMin(lowestPriceDuringRed, currentLow);
            lowestPriceDuringRed = 0.0;
         }
      }
   }
   void UpdateSLUpDownThreeValue(double indicator1_value, double indicator2_value, double indicator3_value, double currentLow, double currentHigh, double &stoploss, double &lowestPriceDuringRed, double &highestPriceDuringGreen)
   {
      if (indicator1_value <= indicator2_value) // Sử dụng indicator1_value và indicator2_value là giá trị kiểu double
      {
         if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
            lowestPriceDuringRed = currentLow;
         if (highestPriceDuringGreen != 0.0)
         {
            stoploss = MathMax(highestPriceDuringGreen, currentHigh);
            highestPriceDuringGreen = 0.0;
         }
      }
      if (indicator1_value >= indicator3_value) // Sử dụng indicator1_value và indicator2_value là giá trị kiểu double
      {
         if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
            highestPriceDuringGreen = currentHigh;
         if (lowestPriceDuringRed != 0.0)
         {
            stoploss = MathMin(lowestPriceDuringRed, currentLow);
            lowestPriceDuringRed = 0.0;
         }
      }
   }
   double CalculateDynamicStoploss(bool isBuyOrder, int lookbackPeriod, int shift, ENUM_TIMEFRAMES TimeFrame)
   {
      if (isBuyOrder)
      {
         int lowestIndex = iLowest(_Symbol, TimeFrame, MODE_LOW, lookbackPeriod, shift);
         double result = iLow(_Symbol, TimeFrame, lowestIndex);
         return result;
      }
      else
      {
         int highestIndex = iHighest(_Symbol, TimeFrame, MODE_HIGH, lookbackPeriod, shift);
         double result = iHigh(_Symbol, TimeFrame, highestIndex);
         return result;
      }
   }

   void CalculatePreviousLowestAndHighest(int shift, int handle, int buffer_index, double &lowestPriceDuringRed, double &highestPriceDuringGreen, ENUM_TIMEFRAMES tf)
   {
      int barsToCheck = 100;

      for (int i = barsToCheck; i > 0; i--)
      {
         int s = i + shift;
         double smiCurrent = 0.0;

         double buffer[];
         if (CopyBuffer(handle, buffer_index, s, 1, buffer) <= 0)
            continue;

         smiCurrent = buffer[0];
         double currentLow = iLow(_Symbol, tf, s);
         double currentHigh = iHigh(_Symbol, tf, s);

         if (smiCurrent < 0)
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (smiCurrent > 0)
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
   }
   void CalculatePreviousLowestAndHighestValue(int shift, int handle, int buffer_index, double value, double &lowestPriceDuringRed, double &highestPriceDuringGreen, ENUM_TIMEFRAMES tf)
   {
      int barsToCheck = 100;

      for (int i = barsToCheck; i > 0; i--)
      {
         int s = i + shift;
         double smiCurrent = 0.0;

         double buffer[];
         if (CopyBuffer(handle, buffer_index, s, 1, buffer) <= 0)
            continue;

         smiCurrent = buffer[0];
         double currentLow = iLow(_Symbol, tf, s);
         double currentHigh = iHigh(_Symbol, tf, s);

         if (smiCurrent < value)
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (smiCurrent > value)
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
   }
   void CalculatePreviousLowestAndHighestThreeValue(int shift, int handle, int buffer_index, double value, double value2, double &lowestPriceDuringRed, double &highestPriceDuringGreen, ENUM_TIMEFRAMES tf)
   {
      int barsToCheck = 100;

      for (int i = barsToCheck; i > 0; i--)
      {
         int s = i + shift;
         double smiCurrent = 0.0;

         double buffer[];
         if (CopyBuffer(handle, buffer_index, s, 1, buffer) <= 0)
            continue;

         smiCurrent = buffer[0];
         double currentLow = iLow(_Symbol, tf, s);
         double currentHigh = iHigh(_Symbol, tf, s);

         if (smiCurrent <= value)
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (smiCurrent >= value2)
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
   }
   void CalculatePreviousLowestAndHighestPrice(int shift, int handle, int buffer_index, double &lowestPriceDuringRed, double &highestPriceDuringGreen, ENUM_TIMEFRAMES tf)
   {
      int barsToCheck = 100;

      for (int i = barsToCheck; i > 0; i--)
      {
         int s = i + shift;
         double smiCurrent = 0.0;
         double price = iClose(_Symbol, tf, s);

         double buffer[];
         if (CopyBuffer(handle, buffer_index, s, 1, buffer) <= 0)
            continue;

         smiCurrent = buffer[0];
         double currentLow = iLow(_Symbol, tf, s);
         double currentHigh = iHigh(_Symbol, tf, s);

         if (smiCurrent > price)
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (smiCurrent < price)
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
   }
   void CalculatePreviousLowestAndHighestIndicatorValue(int shift, int handle1, int buffer_index1, int handle2, int buffer_index2, double &lowestPriceDuringRed, double &highestPriceDuringGreen, ENUM_TIMEFRAMES tf)
   {
      int barsToCheck = 100;

      for (int i = barsToCheck; i > 0; i--)
      {
         int s = i + shift;
         double indicator1Current = 0.0;
         double indicator2Previous = 0.0;

         // Lấy giá trị indicator 1 (current bar)
         double buffer1[];
         if (CopyBuffer(handle1, buffer_index1, s, 1, buffer1) <= 0)
            continue;
         indicator1Current = buffer1[0];

         // Lấy giá trị indicator 2 (previous bar)
         double buffer2[];
         if (CopyBuffer(handle2, buffer_index2, s + 1, 1, buffer2) <= 0)
            continue;
         indicator2Previous = buffer2[0];

         double currentLow = iLow(_Symbol, tf, s);
         double currentHigh = iHigh(_Symbol, tf, s);

         if (indicator1Current < indicator2Previous)
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (indicator1Current > indicator2Previous)
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
   }
   //+------------------------------------------------------------------+
   //|  NEW: Check for lot multiplier updates from multiplier_manager |
   //+------------------------------------------------------------------+
   void CheckForMultiplierUpdate(int magicNumber, double &outMultiplier)
   {
      // Get multiplier from GlobalVariable set by multiplier_manager
      string multiplierKey = "multiplier_" + IntegerToString(magicNumber);

      // Check for symbol-specific multiplier key first: multiplier_{magic}_{symbol}
      string symbolSpecificKey = multiplierKey + "_" + Symbol();
      double symbolSpecificMultiplier = GlobalVariableGet(symbolSpecificKey);

      if (symbolSpecificMultiplier > 0 && symbolSpecificMultiplier != outMultiplier)
      {
         // Symbol-specific multiplier found, use it
         outMultiplier = symbolSpecificMultiplier;
         Print(" Lot multiplier updated (symbol-specific): ", outMultiplier, " for ", Symbol());
      }
      else
      {
         // Fall back to generic multiplier
         double newMultiplier = GlobalVariableGet(multiplierKey);
         if (newMultiplier > 0 && newMultiplier != outMultiplier)
         {
            outMultiplier = newMultiplier;
            Print(" Lot multiplier updated (generic): ", outMultiplier);
         }
      }
   }

   void UpdateTrailingStop(int shift, int MagicNumber, double stoploss)
   {

      for (int i = PositionsTotal() - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if (PositionGetInteger(POSITION_MAGIC) != MagicNumber)
            continue;

         string symbol = PositionGetString(POSITION_SYMBOL);
         if (symbol != _Symbol)
            continue;

         double entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         double currentSL = PositionGetDouble(POSITION_SL);
         long type = PositionGetInteger(POSITION_TYPE);

         double newSL = 0.0;
         bool shouldUpdate = false;

         if (type == POSITION_TYPE_BUY)
         {
            newSL = stoploss;
            if (newSL > currentSL)
               shouldUpdate = true;
         }
         else if (type == POSITION_TYPE_SELL)
         {
            newSL = stoploss;
            if (newSL < currentSL)
               shouldUpdate = true;
         }

         if (shouldUpdate)
         {

            trade.PositionModify(ticket, NormalizeDouble(newSL, _Digits), PositionGetDouble(POSITION_TP));
         }
      }
   }
   void OpenOrderByVolatilityRange(bool isBuySignal, bool isSellSignal, bool acceptBuy, bool acceptSell, double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption,
                                   ENUM_TIMEFRAMES tf, double stoploss, double atr,
                                   double baseLot, double rangeMultiplierHigh, double rangeMultiplierLow,
                                   double lotScaleUp, double lotScaleDown, double lot_min_cap, int n)
   {
      bool has_position = PositionSelect(_Symbol);

      if (!has_position)
      {
         if (acceptBuy && isBuySignal)
         {
            TryOpenOrderByVolatilityRange(ORDER_TYPE_BUY, stoploss, lotThreshold, magicNumber,
                                          atr, baseLot,
                                          rangeMultiplierHigh, rangeMultiplierLow,
                                          lotScaleUp, lotScaleDown, lot_min_cap, n, OrderEntryOption, tf);
         }
         if (acceptSell && isSellSignal)
         {
            TryOpenOrderByVolatilityRange(ORDER_TYPE_SELL, stoploss, lotThreshold, magicNumber, atr, baseLot,
                                          rangeMultiplierHigh, rangeMultiplierLow,
                                          lotScaleUp, lotScaleDown, lot_min_cap, n, OrderEntryOption, tf);
         }
      }
   }
   void OpenOrderByTierRisk(bool isBuySignal, bool isSellSignal, bool acceptBuy, bool acceptSell,
                            double lotThreshold, int magicNumber, OrderEntryMode OrderEntryOption,
                            ENUM_TIMEFRAMES tf, double stoploss, bool EnableDynamicRisk,
                            int &consecutiveWins, int MaxConsecutiveWins,
                            double baseLossPerTrade, double RiskIncreasePercent, double &currentLossPerTrade)
   {
      bool has_position = PositionSelect(_Symbol);

      if (!has_position)
      {
         if (acceptBuy && isBuySignal)
         {
            TryOpenOrderByTierRisk(ORDER_TYPE_BUY, EnableDynamicRisk, stoploss, lotThreshold,
                                   magicNumber, OrderEntryOption, tf,
                                   consecutiveWins, MaxConsecutiveWins,
                                   baseLossPerTrade, RiskIncreasePercent, currentLossPerTrade);
         }
         if (acceptSell && isSellSignal)
         {
            TryOpenOrderByTierRisk(ORDER_TYPE_SELL, EnableDynamicRisk, stoploss, lotThreshold,
                                   magicNumber, OrderEntryOption, tf,
                                   consecutiveWins, MaxConsecutiveWins,
                                   baseLossPerTrade, RiskIncreasePercent, currentLossPerTrade);
         }
      }
   }

   void CreateConnection(string SERVER_IP_ADDRESS, int SERVER_PORT, SOCKET64 &client)
   {
      Print("🔗 Creating new connection...");

      char wsaData[];
      ArrayResize(wsaData, sizeof(WSAData));
      int res = WSAStartup(MAKEWORD(2, 2), wsaData);
      if (res != 0)
      {
         Print("  WSAStartup failed error: ", string(res));
         return;
      }

      // create a socket
      client = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
      if (client == INVALID_SOCKET64)
      {
         Print("  socket failed error: ", WSAErrorDescript(WSAGetLastError()));
         CloseClean(client);
         return;
      }

      // connect to server
      char ch[];
      StringToCharArray(SERVER_IP_ADDRESS, ch);
      sockaddr_in addrin;
      addrin.sin_family = AF_INET;
      addrin.sin_addr = inet_addr(ch);
      addrin.sin_port = htons(SERVER_PORT);
      ref_sockaddr ref;
      sockaddrIn2RefSockaddr(addrin, ref);

      res = connect(client, ref.ref, sizeof(addrin));
      if (res == SOCKET_ERROR)
      {
         int err = WSAGetLastError();
         if (err != WSAEISCONN && err != WSAEWOULDBLOCK)
         {
            Print(" connect failed error: ", WSAErrorDescript(err));
            CloseClean(client);
            return;
         }
      }

      // set to nonblocking mode
      int non_block = 1;
      res = ioctlsocket(client, (int)FIONBIO, non_block);
      if (res != NO_ERROR)
      {
         Print("ioctlsocket failed error: ", string(res));
         CloseClean(client);
         return;
      }

      // Reset states
      registered = false;
      last_server_response = TimeCurrent();
      last_heartbeat_sent = 0;

      Print(" Socket connected to server at ", SERVER_IP_ADDRESS, ":", SERVER_PORT);
   }
   void CloseClean(SOCKET64 &client)
   {
      registered = false;
      if (client != INVALID_SOCKET64)
      {
         closesocket(client);
         client = INVALID_SOCKET64;
      }
      WSACleanup();
      Print("🧹 Socket closed and cleaned up");
   }
   bool SendData(string data, SOCKET64 &client)
   {
      if (client == INVALID_SOCKET64)
         return false;

      data = data + "\n";

      char send_buffer[];
      StringToCharArray(data, send_buffer);

      int sent = send(client, send_buffer, ArraySize(send_buffer) - 1, 0);
      if (sent == SOCKET_ERROR)
      {
         int err = WSAGetLastError();
         if (err != WSAEWOULDBLOCK)
         {
            Print("Send failed: ", WSAErrorDescript(err));
            CloseClean(client);
            return false;
         }
      }
      return true;
   }
   void SendHeartbeat(string EA_ID, SOCKET64 &client)
   {
      if (client == INVALID_SOCKET64)
         return;

      string heartbeat = StringFormat(
          "{\"type\":\"heartbeat\",\"ea_id\":\"%s\",\"timestamp\":\"%s\"}",
          EA_ID,
          TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS));

      if (SendData(heartbeat, client))
      {
         last_heartbeat_sent = TimeCurrent();
      }
   }
   double ExtractDoubleValue(string json, string key)
   {
      string searchKey = "\"" + key + "\":";
      int pos = StringFind(json, searchKey);
      if (pos == -1)
         return 0;

      pos += StringLen(searchKey);
      int endPos = StringFind(json, ",", pos);
      if (endPos == -1)
         endPos = StringFind(json, "}", pos);

      string value = StringSubstr(json, pos, endPos - pos);
      StringReplace(value, "\"", "");
      StringReplace(value, " ", "");

      return StringToDouble(value);
   }

   bool ExtractBoolValue(string json, string key)
   {
      string searchKey = "\"" + key + "\":";
      int pos = StringFind(json, searchKey);
      if (pos == -1)
         return false;

      pos += StringLen(searchKey);
      int endPos = StringFind(json, ",", pos);
      if (endPos == -1)
         endPos = StringFind(json, "}", pos);

      string value = StringSubstr(json, pos, endPos - pos);
      StringReplace(value, "\"", "");
      StringReplace(value, " ", "");

      return (value == "true");
   }

   double NormalizeVolumeByStep(const string symbol, double vol)
   {
      double vmin = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      double vmax = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      double vstep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

      if (vstep <= 0)
         vstep = 0.01;

      // clamp
      if (vol < vmin)
         vol = vmin;
      if (vol > vmax)
         vol = vmax;

      // floor theo step để không vượt limit
      double k = MathFloor(vol / vstep + 1e-9);
      double vn = k * vstep;

      if (vn < vmin)
         vn = vmin;
      if (vn > vmax)
         vn = vmax;

      return vn;
   }

   bool OrderCheckVolumeOK(const string symbol, ENUM_ORDER_TYPE type, double vol, uint deviation = 20)
   {
      MqlTradeRequest req;
      MqlTradeCheckResult chk;
      ZeroMemory(req);
      ZeroMemory(chk);

      req.action = TRADE_ACTION_DEAL;
      req.symbol = symbol;
      req.type = type;
      req.volume = NormalizeVolumeByStep(symbol, vol);
      req.deviation = deviation;

      double ask = SymbolInfoDouble(symbol, SYMBOL_ASK);
      double bid = SymbolInfoDouble(symbol, SYMBOL_BID);
      if (ask <= 0 || bid <= 0)
         return false;

      req.price = (type == ORDER_TYPE_BUY) ? ask : bid;

      //  QUAN TRỌNG: set filling + time để OrderCheck không fail "oan"
      long filling = SYMBOL_FILLING_FOK;
      if (!SymbolInfoInteger(symbol, SYMBOL_FILLING_MODE, filling))
         filling = SYMBOL_FILLING_FOK;

      req.type_filling = (ENUM_ORDER_TYPE_FILLING)filling;
      req.type_time = ORDER_TIME_GTC;

      ResetLastError();
      if (!OrderCheck(req, chk))
         return false;

      //  Các retcode OK cho OrderCheck
      if (chk.retcode == TRADE_RETCODE_DONE ||
          chk.retcode == TRADE_RETCODE_PLACED)
         return true;

      return false;
   }

   // Trả về max lot "thực tế" tại thời điểm hiện tại (ước lượng).
   // Nếu vmin còn không pass -> trả về 0.
   double GetMaxLotNowBinary(const string symbol, ENUM_ORDER_TYPE type, int iterations = 20, uint deviation = 20)
   {
      double vmin = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
      double vmax = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
      double vstep = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);

      if (vstep <= 0)
         vstep = 0.01;

      vmin = NormalizeVolumeByStep(symbol, vmin);
      vmax = NormalizeVolumeByStep(symbol, vmax);

      // Nếu min còn không OK thì coi như không trade được lúc này
      if (!OrderCheckVolumeOK(symbol, type, vmin, deviation))
         return 0.0;

      double lo = vmin;
      double hi = vmax;
      double ans = vmin;

      for (int i = 0; i < iterations; i++)
      {
         double mid = NormalizeVolumeByStep(symbol, (lo + hi) / 2.0);

         // tránh kẹt khi mid == ans do step
         if (mid <= ans)
            mid = NormalizeVolumeByStep(symbol, ans + vstep);

         if (mid > hi)
            break;

         if (OrderCheckVolumeOK(symbol, type, mid, deviation))
         {
            ans = mid;
            lo = mid;
         }
         else
         {
            hi = mid - vstep;
            if (hi < lo)
               break;
         }
      }

      return NormalizeVolumeByStep(symbol, ans);
   }
};

class HandleValuesBase
{
public:
   HandleValuesBase() {}
   virtual ~HandleValuesBase() {}
   virtual void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) = 0;
   virtual HandleValuesBase *GetIndicatorValues(int shift) = 0;
   virtual TradingSignals EvaluateTradingSignals(HandleValuesBase *handleValues, double price) = 0;
};

//+------------------------------------------------------------------+
//|  NEW: Bot Command Manager - Centralized command/status handling |
//+------------------------------------------------------------------+
class CBotCommandManager
{
private:
   int botMagic;
   bool isStopped;

public:
   //+------------------------------------------------------------------+
   //| Detect actual bot magic from GlobalVariables                      |
   //+------------------------------------------------------------------+
   int DetectActualMagic(int inputMagic)
   {
      // Scan GlobalVariables for bot_input_{symbol}_{magic}_* pattern
      // to find the actual magic number if different from input

      // string symbol = _Symbol;
      // int gvTotal = GlobalVariablesTotal();

      // for (int i = 0; i < gvTotal; i++)
      // {
      //    string varName = GlobalVariableName(i);

      //    // Look for pattern: bot_input_{symbol}_{magic}_*
      //    string prefix = "bot_input_" + symbol + "_";
      //    if (StringFind(varName, prefix) == 0)
      //    {
      //       // Extract magic number from variable name
      //       // Format: bot_input_DE30_11401_paramName
      //       string afterPrefix = StringSubstr(varName, StringLen(prefix));
      //       int underscorePos = StringFind(afterPrefix, "_");

      //       if (underscorePos > 0)
      //       {
      //          string magicStr = StringSubstr(afterPrefix, 0, underscorePos);
      //          int detectedMagic = (int)StringToDouble(magicStr);

      //          if (detectedMagic > 0 && detectedMagic != inputMagic)
      //          {
      //             Print("🔍 Detected actual bot magic: ", detectedMagic, " (input was: ", inputMagic, ")");
      //             return detectedMagic;
      //          }
      //       }
      //    }
      // }

      // Not found, use input magic
      return inputMagic;
   }

   CBotCommandManager(int magic) : botMagic(magic), isStopped(false)
   {
      //  NEW: Detect actual magic from GlobalVariables
      botMagic = DetectActualMagic(magic);
   }

   //+------------------------------------------------------------------+
   //| Check for stop/remove/resume commands from server                |
   //+------------------------------------------------------------------+
   void CheckForCommands(bool &botStoppedFlag)
   {
      //  NEW: Use symbol-specific command key
      // Pattern: bot_command_{symbol}_{magic}_action
      // This ensures only the matching symbol processes the command

      string symbolSpecificCommandKey = "bot_command_" + _Symbol + "_" + IntegerToString(botMagic) + "_action";
      double action = GlobalVariableGet(symbolSpecificCommandKey);

      if (action > 0) // Any command present
      {
         Print(" Command found! Action code: ", action);
         if (action == 1.0) // STOP command
         {
            botStoppedFlag = true;
            isStopped = true;
            SendStatusUpdate("stopped");
            GlobalVariableDel(symbolSpecificCommandKey); // Clean up after processing
         }
         else if (action == 3.0) // REMOVE command
         {
            botStoppedFlag = true;
            isStopped = true;
            SendStatusUpdate("removed");
            GlobalVariableDel(symbolSpecificCommandKey); // Clean up after processing
            Print("🗑️ Removing EA from chart...");
            ExpertRemove();
         }
         else if (action == 2.0) // RESUME command
         {
            botStoppedFlag = false;
            isStopped = false;
            SendStatusUpdate("active");
            GlobalVariableDel(symbolSpecificCommandKey); // Clean up after processing
         }
      }
      else
      {
         //  Check if bot status in GlobalVariable matches local flag
         // This syncs botStoppedFlag with persistent GlobalVariable status

         string magicStr = IntegerToString(botMagic);
         string statusValueKey = "bot_status_value_" + magicStr + "_" + _Symbol; //  INCLUDE SYMBOL!
         double statusValue = GlobalVariableGet(statusValueKey);

         // Sync botStoppedFlag with GlobalVariable status
         // 1.0 = active, 2.0 = stopped, 3.0 = removed
         if (statusValue == 2.0)
         {
            // Status says STOPPED
            botStoppedFlag = true;
            isStopped = true;
         }
         else if (statusValue == 3.0)
         {
            // Status says REMOVED
            botStoppedFlag = true;
            isStopped = true;
         }
         else
         {
            // Status says ACTIVE (or not set = default active)
            botStoppedFlag = false;
            isStopped = false;
         }
      }
   }

   //+------------------------------------------------------------------+
   //| Send status update to multiplier_manager                         |
   //+------------------------------------------------------------------+
   void SendStatusUpdate(string newStatus)
   {
      string magicStr = IntegerToString(botMagic);
      string symbol = _Symbol;

      //  NEW: Use symbol-specific keys
      string statusKey = "bot_status_" + magicStr + "_" + symbol;
      string statusValueKey = "bot_status_value_" + magicStr + "_" + symbol;

      GlobalVariableSet(statusKey, 1.0); // Flag for update detection

      // 1.0 = active, 2.0 = stopped, 3.0 = removed
      double statusValue = 1.0;
      if (newStatus == "stopped")
         statusValue = 2.0;
      else if (newStatus == "removed")
         statusValue = 3.0;

      GlobalVariableSet(statusValueKey, statusValue);
      GlobalVariableSet(statusKey + "_timestamp", (double)TimeCurrent());

      Print(" Status update sent: ", magicStr, " (", symbol, ") -> ", newStatus);
   }

   //+------------------------------------------------------------------+
   //| Update heartbeat every tick                                      |
   //+------------------------------------------------------------------+
   void UpdateHeartbeat()
   {
      string heartbeatKey = "bot_heartbeat_" + IntegerToString(botMagic);
      GlobalVariableSet(heartbeatKey, (double)TimeCurrent());
   }

   //+------------------------------------------------------------------+
   //| Cleanup command variables                                        |
   //+------------------------------------------------------------------+
   void CleanupCommand()
   {
      GlobalVariableDel("bot_command_" + IntegerToString(botMagic) + "_action");
      GlobalVariableDel("bot_command_" + IntegerToString(botMagic) + "_timestamp");
   }

   //+------------------------------------------------------------------+
   //| Initialize bot config on GlobalVariables                         |
   //+------------------------------------------------------------------+
   void InitializeBot(string symbol, ENUM_TIMEFRAMES timeframe,
                      bool acceptBuy, bool acceptSell)
   {
      // Write bot identification
      GlobalVariableSet("bot_magic_" + IntegerToString(botMagic), botMagic);

      // Write symbol marker: bot_symbol_{magic}_{SYMBOL}
      GlobalVariableSet("bot_symbol_" + IntegerToString(botMagic) + "_" + symbol, 1.0);

      // Write timeframe (symbol-specific)
      string baseKey = "bot_input_" + symbol + "_" + IntegerToString(botMagic);
      GlobalVariableSet(baseKey + "_timeframe", (double)timeframe);

      // Write trade direction (1.0=Buy/B, 2.0=Sell/S)
      double tradeDirectionValue = 1.0;
      if (acceptBuy && acceptSell)
         tradeDirectionValue = 1.0; // Both, prioritize Buy
      else if (acceptSell && !acceptBuy)
         tradeDirectionValue = 2.0; // Only Sell
      else
         tradeDirectionValue = 1.0; // Only Buy or default

      GlobalVariableSet("bot_trade_direction_" + IntegerToString(botMagic), tradeDirectionValue);

      // Write initial status as active
      GlobalVariableSet("bot_status_value_" + IntegerToString(botMagic), 1.0);
      GlobalVariableSet("bot_status_" + IntegerToString(botMagic), 1.0);

      //  CRITICAL: Clear any leftover command from previous session
      string magicStr = IntegerToString(botMagic);
      GlobalVariableDel("bot_command_" + symbol + "_" + magicStr + "_action");
      GlobalVariableDel("bot_command_" + symbol + "_" + magicStr + "_action_timestamp");

      Print(" Bot ", botMagic, " initialized: ", symbol, " TF=", timeframe,
            " Dir=", (tradeDirectionValue == 1.0 ? "B" : "S"));
   }

   //+------------------------------------------------------------------+
   //| Cleanup all bot-related GlobalVariables (call in OnDeinit)      |
   //+------------------------------------------------------------------+
   void Cleanup()
   {
      string magicStr = IntegerToString(botMagic);
      string symbol = _Symbol;

      // Remove all bot_input_* variables (both old and new patterns)
      // Old pattern: bot_input_{magic}_*
      // New pattern: bot_input_{symbol}_{magic}_*
      for (int i = GlobalVariablesTotal() - 1; i >= 0; i--)
      {
         string varName = GlobalVariableName(i);

         // Check for new pattern: bot_input_{symbol}_{magic}_*
         if (StringFind(varName, "bot_input_" + symbol + "_" + magicStr + "_") == 0)
         {
            GlobalVariableDel(varName);
            Print("  🗑️ Deleted: ", varName);
         }
         // Check for old pattern: bot_input_{magic}_*
         else if (StringFind(varName, "bot_input_" + magicStr + "_") == 0)
         {
            GlobalVariableDel(varName);
            Print("  🗑️ Deleted (old pattern): ", varName);
         }
      }

      // Remove bot_symbol_{magic}_{symbol} marker
      GlobalVariableDel("bot_symbol_" + magicStr + "_" + symbol);

      // Remove bot_magic_{magic}
      GlobalVariableDel("bot_magic_" + magicStr);

      // Remove bot_heartbeat_{magic}
      GlobalVariableDel("bot_heartbeat_" + magicStr);

      // Remove bot_trade_direction_{magic}
      GlobalVariableDel("bot_trade_direction_" + magicStr);

      // Remove bot_status_* variables
      GlobalVariableDel("bot_status_" + magicStr);
      GlobalVariableDel("bot_status_value_" + magicStr);
      GlobalVariableDel("bot_status_" + magicStr + "_timestamp");
      // New pattern with symbol (used in SendStatusUpdate)
      GlobalVariableDel("bot_status_" + magicStr + "_" + symbol);
      GlobalVariableDel("bot_status_value_" + magicStr + "_" + symbol);
      GlobalVariableDel("bot_status_" + magicStr + "_" + symbol + "_timestamp");

      // Remove bot_config_{magic}_* if exists
      for (int i = GlobalVariablesTotal() - 1; i >= 0; i--)
      {
         string varName = GlobalVariableName(i);
         string prefix = "bot_config_" + magicStr + "_";
         if (StringFind(varName, prefix) == 0)
         {
            GlobalVariableDel(varName);
            Print("  🗑️ Deleted config: ", varName);
         }
      }

      // Remove bot_command_{magic}_* if exists (old pattern)
      for (int i = GlobalVariablesTotal() - 1; i >= 0; i--)
      {
         string varName = GlobalVariableName(i);
         string prefix = "bot_command_" + magicStr + "_";
         if (StringFind(varName, prefix) == 0)
         {
            GlobalVariableDel(varName);
            Print("  🗑️ Deleted command (old): ", varName);
         }
      }

      //  NEW: Remove symbol-specific command: bot_command_{symbol}_{magic}_*
      // First, explicitly delete the known command keys
      GlobalVariableDel("bot_command_" + symbol + "_" + magicStr + "_action");
      GlobalVariableDel("bot_command_" + symbol + "_" + magicStr + "_action_timestamp");

      // Then scan and delete any remaining bot_command_* variables for this bot
      for (int i = GlobalVariablesTotal() - 1; i >= 0; i--)
      {
         string varName = GlobalVariableName(i);
         string prefix = "bot_command_" + symbol + "_" + magicStr + "_";
         if (StringFind(varName, prefix) == 0)
         {
            GlobalVariableDel(varName);
            Print("  🗑️ Deleted command (symbol-specific): ", varName);
         }
      }

      //  NEW: Remove multiplier variables for this magic and symbol
      // Pattern: multiplier_{magic} (generic) and multiplier_{magic}_{symbol} (symbol-specific)
      GlobalVariableDel("multiplier_" + magicStr);
      GlobalVariableDel("multiplier_" + magicStr + "_" + symbol);
      GlobalVariableDel("multiplier_" + magicStr + "_generic");
      Print("  🗑️ Deleted multiplier vars: multiplier_", magicStr, " and multiplier_", magicStr, "_", symbol);

      //  NEW: Remove multiplier status variables
      for (int i = GlobalVariablesTotal() - 1; i >= 0; i--)
      {
         string varName = GlobalVariableName(i);
         string prefix = "multiplier_status_" + magicStr;
         if (StringFind(varName, prefix) == 0)
         {
            GlobalVariableDel(varName);
            Print("  🗑️ Deleted multiplier status: ", varName);
         }
      }

      Print(" Bot ", botMagic, " (", symbol, ") cleanup completed - all variables cleared");
   }

   bool IsStopped() { return isStopped; }
};

// Define static member variable for CTradeCustomEx
double CTradeCustomEx::s_multiplier = 1.0;
datetime CTradeCustomEx::last_heartbeat_sent = 0;
datetime CTradeCustomEx::last_server_response = 0;
bool CTradeCustomEx::registered = false;
FailedAttempt CTradeCustomEx::lastFailedAttempts[];
TimeframeBarState CTradeCustomEx::barStates[];
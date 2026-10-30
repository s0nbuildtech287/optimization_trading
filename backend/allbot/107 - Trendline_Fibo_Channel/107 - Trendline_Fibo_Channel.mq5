//+------------------------------------------------------------------+
//|                        Copyright 2025, LotusQuant                  |
//|                        https://LotusQuant.com                      |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2025, LotusQuant"
#property link "https://LotusQuant.com"
#property version "1.00"
#include <Trade/LotusQuantLibrary.mqh>

enum ENUM_LINE_TYPE
{
   EXM_EXM,  // 0: By 2 extremums
   EXM_DELTA // 1: Extremum and delta
};
enum ENUM_FIBO_RATIO
{
   FIBO_1000 = 0, // 1.000
   FIBO_1618 = 1, // 1.618
   FIBO_2618 = 2, // 2.618
   FIBO_3618 = 3, // 3.618
   FIBO_4236 = 4, // 4.236
};

CTradeCustomEx tradeCustom;

input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input ENUM_LINE_TYPE InpLineType = EXM_DELTA;        // Line type
input int InpLeftExmSide = 20;                       // Left extremum side (Type 1, 2)
input int InpRightExmSide = 3;                       // Right extremum side (Type 1)
input int InpFromCurrent = 2;                        // Offset from the current bar (Type 2)
input int linesWidth = 2;                            // Lines Width
input double thereshold = 0.0001;                    // Threshold for trend detection
input int maximumBars = 1000;                        // Maximum bars to process
input ENUM_FIBO_RATIO fiboRatioEnum = FIBO_1618;     // Tỷ lệ Fibonacci cho Take Profit
double touchTolerance = 10;
int lookbackBars = 50;

double stoploss = 0.0;
double takeprofit = 0.0;
int autoTrendHanle;
FailedAttempt lastFailedAttempts[];
// Struct để lưu thông tin touch point
struct TouchPoint
{
   double price;
   int barIndex;
   datetime time;
   bool isValid;

   TouchPoint() : price(0), barIndex(-1), time(0), isValid(false) {}
};

TouchPoint lastSupportTouch;    // Điểm chạm support cuối cùng
TouchPoint lastResistanceTouch; // Điểm chạm resistance cuối cùng
double GetFibonacciRatio(ENUM_FIBO_RATIO ratio)
{
   switch (ratio)
   {
   case FIBO_2618:
      return 2.618;
   case FIBO_3618:
      return 3.618;
   case FIBO_4236:
      return 4.236;
   case FIBO_1618:
      return 1.618;
   case FIBO_1000:
      return 1.000;
   default:
      return 1.618;
   }
}
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   static HandleValues *instance;
   HandleValues() { instance = NULL; }

   // Giá trị của các chỉ báo
   double supportValue;
   double resistanceValue;
   double trendValue;

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;
      bool has_position = PositionSelect(_Symbol);
      // Cập nhật touch points trước khi đánh giá signal
      UpdateTouchPoints(shift);

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (!has_position)
      {

         // Tính toán stop loss và take profit dựa trên tín hiệu
         if (signals.buy && AcceptBuy)
         {
            double pricePrev = iLow(_Symbol, SelectedTimeframe, shift);

            stoploss = CalculateBuyStopLoss();
            takeprofit = CalculateBuyTakeProfit(pricePrev);
            TryOpenOrder(ORDER_TYPE_BUY, stoploss, takeprofit);
         }
         else if (signals.sell && AcceptSell)
         {
            double pricePrev = iHigh(_Symbol, SelectedTimeframe, shift);

            stoploss = CalculateSellStopLoss();
            takeprofit = CalculateSellTakeProfit(pricePrev);
            TryOpenOrder(ORDER_TYPE_SELL, stoploss, takeprofit);
         }
      }

      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney,
                             lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (autoTrendHanle == INVALID_HANDLE)
      {
         Print("Error getting handle :", GetLastError());
         return instance;
      }

      double spBuffer[];
      double resBuffer[];
      double trendBuffer[];

      int copiedSp = CopyBuffer(autoTrendHanle, 0, shift, 1, spBuffer);
      int copiedRes = CopyBuffer(autoTrendHanle, 1, shift, 1, resBuffer);
      int copiedTrend = CopyBuffer(autoTrendHanle, 2, shift, 1, trendBuffer);

      if (copiedSp > 0 && copiedRes > 0 && copiedTrend > 0)
      {
         instance.supportValue = spBuffer[0];
         instance.resistanceValue = resBuffer[0];
         instance.trendValue = trendBuffer[0];
      }

      return instance;
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      double PriceLow = iLow(_Symbol, SelectedTimeframe, 1);
      double PriceHigh = iHigh(_Symbol, SelectedTimeframe, 1);

      // Kiểm tra tín hiệu mua khi giá chạm support
      signals.buy = (PriceLow <= instance.supportValue + touchTolerance * _Point) && instance.trendValue == 1;

      // Kiểm tra tín hiệu bán khi giá chạm resistance
      signals.sell = (PriceHigh >= instance.resistanceValue - touchTolerance * _Point) && instance.trendValue == -1;

      return signals;
   }
   void UpdateTouchPoints(int currentShift)
   {
      double tolerance = touchTolerance * _Point;
      bool foundSupportTouch = false;
      bool foundResistanceTouch = false;

      // Tìm điểm chạm support gần nhất
      for (int i = currentShift + 1; i <= currentShift + lookbackBars; i++)
      {
         double low = iLow(_Symbol, SelectedTimeframe, i);
         double high = iHigh(_Symbol, SelectedTimeframe, i);
         datetime time = iTime(_Symbol, SelectedTimeframe, i);

         // Lấy giá trị support tại thời điểm đó
         double supportAtTime = GetSupportValueAtBar(i);

         // Kiểm tra nếu low chạm support
         if (supportAtTime != EMPTY_VALUE &&
             low <= supportAtTime)
         {
            if (!foundSupportTouch || i < lastSupportTouch.barIndex)
            {
               lastSupportTouch.price = low;
               lastSupportTouch.barIndex = i;
               lastSupportTouch.time = time;
               lastSupportTouch.isValid = true;
               foundSupportTouch = true;
            }
         }

         // Lấy giá trị resistance tại thời điểm đó
         double resistanceAtTime = GetResistanceValueAtBar(i);

         // Kiểm tra nếu high chạm resistance
         if (resistanceAtTime != EMPTY_VALUE &&
             high >= resistanceAtTime)
         {
            if (!foundResistanceTouch || i < lastResistanceTouch.barIndex)
            {
               lastResistanceTouch.price = high;
               lastResistanceTouch.barIndex = i;
               lastResistanceTouch.time = time;
               lastResistanceTouch.isValid = true;
               foundResistanceTouch = true;
            }
         }
      }
   }

   // Lấy giá trị support tại một bar cụ thể
   double GetSupportValueAtBar(int barIndex)
   {
      double buffer[];
      if (CopyBuffer(autoTrendHanle, 0, barIndex, 1, buffer) > 0)
         return buffer[0];
      return EMPTY_VALUE;
   }

   // Lấy giá trị resistance tại một bar cụ thể
   double GetResistanceValueAtBar(int barIndex)
   {
      double buffer[];
      if (CopyBuffer(autoTrendHanle, 1, barIndex, 1, buffer) > 0)
         return buffer[0];
      return EMPTY_VALUE;
   }

   // Tính toán stop loss cho lệnh BUY
   double CalculateBuyStopLoss()
   {
      if (lastSupportTouch.isValid)
      {
         double buyStopLoss = lastSupportTouch.price - 5 * _Point; // Trừ thêm 5 pips để an toàn

         return buyStopLoss;
      }
      return 0; // Không có stop loss nếu không tìm thấy touch point
   }

   // Tính toán stop loss cho lệnh SELL
   double CalculateSellStopLoss()
   {
      if (lastResistanceTouch.isValid)
      {
         double sellStopLoss = lastResistanceTouch.price + 5 * _Point; // Cộng thêm 5 pips để an toàn

         return sellStopLoss;
      }
      return 0; // Không có stop loss nếu không tìm thấy touch point
   }
   double FindRecentHigh()
   {
      int candlesBack = 20; // Số nến để xem xét
      double recentHigh = -DBL_MAX;
      for (int i = 1; i <= candlesBack; i++)
      {
         double high = iHigh(_Symbol, PERIOD_CURRENT, i);
         if (high > recentHigh)
            recentHigh = high;
      }
      return recentHigh;
   }

   double FindRecentLow()
   {
      int candlesBack = 20;
      double recentLow = DBL_MAX;
      for (int i = 1; i <= candlesBack; i++)
      {
         double low = iLow(_Symbol, PERIOD_CURRENT, i);
         if (low < recentLow)
            recentLow = low;
      }
      return recentLow;
   }

   // Tính toán take profit cho lệnh BUY theo Fibonacci
   double CalculateBuyTakeProfit(double entryPrice)
   {
      if (lastSupportTouch.isValid)
      {
         double recentHigh = FindRecentHigh(); // Đỉnh gần nhất
         double fiboRatio = GetFibonacciRatio(fiboRatioEnum);
         double buyTakeProfit = entryPrice + (recentHigh - entryPrice) * fiboRatio; // Đỉnh gần nhất + khoảng fibo
         return buyTakeProfit;
      }
      return 0;
   }

   // Tính toán take profit cho lệnh SELL theo Fibonacci
   double CalculateSellTakeProfit(double entryPrice)
   {
      if (lastResistanceTouch.isValid)
      {
         double recentLow = FindRecentLow(); // Đáy gần nhất
         double fiboRatio = GetFibonacciRatio(fiboRatioEnum);
         double sellTakeProfit = entryPrice - (entryPrice - recentLow) * fiboRatio; // Đáy gần nhất - khoảng fibo
         return sellTakeProfit;
      }
      return 0;
   }

   void TryOpenOrder(ENUM_ORDER_TYPE orderType, double stop_loss, double tp)
   {
      double entryPrice;
      if (orderType == ORDER_TYPE_BUY)
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, SelectedTimeframe, 1);
         else
            entryPrice = iOpen(_Symbol, SelectedTimeframe, 0);
      }
      else
      {
         if (OrderEntryOption == ENTRY_ATO || OrderEntryOption == ENTRY_ATC)
            entryPrice = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         else if (OrderEntryOption == ENTRY_LIMIT_PREV_CLOSE)
            entryPrice = iClose(_Symbol, SelectedTimeframe, 1);
         else
            entryPrice = iOpen(_Symbol, SelectedTimeframe, 0);
      }
      double CSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_CONTRACT_SIZE);
      double riskDistance = MathAbs(entryPrice - stop_loss);
      double qty = CalculateLotSize(entryPrice, stop_loss);
      if (qty > 0.0)
         ExecuteOrders(orderType, qty, stop_loss, tp, entryPrice, TfToStr(SelectedTimeframe));
   }
   double CalculateLotSize(double entryPrice, double stopLoss)
   {
      if (stopLoss <= 0 || entryPrice <= 0 || stopLoss == entryPrice)
         return 0.0;

      double pointValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double pointSize = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
      double pipDistance = MathAbs(entryPrice - stopLoss) / pointSize;

      double lotSize = riskMoney / (pipDistance * pointValue);

      double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);

      double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

      lotSize = NormalizeDouble(MathRound(lotSize / lotStep) * lotStep, 2);
      lotSize = fmax(lotSize, minLot);

      return lotSize;
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
   bool ExecuteOrders(ENUM_ORDER_TYPE orderType, double qty, double stop_loss, double tp, double entryPrice, string tfStr)
   {
      // Use tfStr directly (always passed from caller)
      string actualTfStr = tfStr;

      // Build comment prefix once (reused for all orders)
      string bsStr = (orderType == ORDER_TYPE_BUY) ? "B" : "S";
      string commentPrefix = IntegerToString(MagicNumber) + "_" +
                             DoubleToString(riskMoney, 0) + "_";

      trade.SetExpertMagicNumber(MagicNumber);

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  CHECK LOT THRESHOLD - Nếu qty > lotThreshold thì skip order
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (lotThreshold > 0 && qty > lotThreshold)
      {
         Print(" SKIP ORDER: Calculated lot (", qty, ") exceeds lotThreshold (", lotThreshold, ")");
         Print("   Magic:", MagicNumber, " | Symbol:", _Symbol, " | TF:", TfToStr(SelectedTimeframe));
         RecordFailedAttempt(MagicNumber, SelectedTimeframe, orderType);
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

            ok = trade.Buy(lotToTrade, _Symbol, entryPrice, stop_loss, tp, comment);
            ulong elapsed = GetMicrosecondCount() - timeStart;
            Print(" OrderSend took ", elapsed / 1000, "ms");
         }
         else
            ok = trade.Sell(lotToTrade, _Symbol, entryPrice, stop_loss, tp, comment);

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
            RecordFailedAttempt(MagicNumber, SelectedTimeframe, orderType);
            break;
         }

         // LỖI NGHIÊM TRỌNG - Thử chia nhỏ
         if (rc == TRADE_RETCODE_ERROR ||
             rc == TRADE_RETCODE_SERVER_DISABLES_AT ||
             rc == TRADE_RETCODE_TOO_MANY_REQUESTS)
         {
            Print("    Critical error, will try to split order smaller");
            RecordFailedAttempt(MagicNumber, SelectedTimeframe, orderType);

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
            RecordFailedAttempt(MagicNumber, SelectedTimeframe, orderType);
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
                  ok = trade.Buy(combined, _Symbol, entryPrice, stop_loss, tp, comment);
               else
                  ok = trade.Sell(combined, _Symbol, entryPrice, stop_loss, tp, comment);

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
                     ok = trade.Buy(lotToTry, _Symbol, entryPrice, stop_loss, tp, comment);
                  else
                     ok = trade.Sell(lotToTry, _Symbol, entryPrice, stop_loss, tp, comment);

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

   void RecordFailedAttempt(int MagicNumber, ENUM_TIMEFRAMES timeframe, ENUM_ORDER_TYPE orderType)
   {
      datetime currentBarTime = iTime(_Symbol, timeframe, 0);

      // Tìm slot trống hoặc slot cũ để ghi đè
      int insertIndex = -1;
      for (int i = 0; i < ArraySize(lastFailedAttempts); i++)
      {
         // Nếu đã có record cho cây nến này rồi thì không cần thêm
         if (lastFailedAttempts[i].barTime == currentBarTime &&
             lastFailedAttempts[i].magicNumber == MagicNumber &&
             lastFailedAttempts[i].timeframe == timeframe &&
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
      lastFailedAttempts[insertIndex].magicNumber = MagicNumber;
      lastFailedAttempts[insertIndex].timeframe = timeframe;
      lastFailedAttempts[insertIndex].orderType = orderType;
   }
};

HandleValues *HandleValues::instance = NULL;

int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber);
   autoTrendHanle = iCustom(_Symbol, SelectedTimeframe, "AutoTrendLine", InpLineType, InpLeftExmSide, InpRightExmSide, InpFromCurrent, false, linesWidth, true, true, thereshold, true, maximumBars);
   if (autoTrendHanle == INVALID_HANDLE)
   {
      Print("Failed to create indicator handle");
      return INIT_FAILED;
   }

   if (HandleValues::instance == NULL)
      HandleValues::instance = new HandleValues();

   // Reset touch points
   lastSupportTouch = TouchPoint();
   lastResistanceTouch = TouchPoint();

   Print("EA initialized successfully. Magic Number: ", MagicNumber);
   return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (autoTrendHanle != INVALID_HANDLE)
      IndicatorRelease(autoTrendHanle);

   if (HandleValues::instance != NULL)
   {
      delete HandleValues::instance;
      HandleValues::instance = NULL;
   }

   Print("EA deinitialized. Reason: ", reason);
}

void OnTick()
{
   tradeCustom.OnTick(StaticSignalHandler, OrderEntryOption, SelectedTimeframe);
}

void StaticSignalHandler(double price, double currentLow, double currentHigh, int shift)
{
   if (HandleValues::instance != NULL)
      HandleValues::instance.ProcessTickCommon(price, currentLow, currentHigh, shift);
}
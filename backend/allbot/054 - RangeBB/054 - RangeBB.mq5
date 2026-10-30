//+------------------------------------------------------------------+
//|                        Copyright 2026, LotusQuant                  |
//|                        https://LotusQuant.com                      |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2026, LotusQuant"
#property link "https://LotusQuant.com"
#property version "1.00"
#include <Trade/LotusQuantLibrary.mqh>
CTradeCustomEx tradeCustom;

// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int range = 20;                                // Range check sideWay
input double thresholdSideWay = 0.7;                 // Hệ số độ rộng trung bình sideway
input int bbPeriod = 14;                             // Period for Bollinger Bands
input int bbShift = 0;                               // Shift for Bollinger Bands
input double bbDeviation = 2.0;                      // Deviation for Bollinger Bands
input int SL_Lookback = 20;                          // Lookback period for dynamic stoploss calculation
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int bb_handle;
double pricePrev = 0.0;

// Indicator handles

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double bands_up;
   double bands_mid;
   double bands_low;
   double bands_upPrev;
   double bands_lowPrev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (AcceptBuy)
      {
         stoploss = tradeCustom.CalculateDynamicStoploss(true, SL_Lookback, shift, SelectedTimeframe);
      }
      else
      {
         stoploss = tradeCustom.CalculateDynamicStoploss(false, SL_Lookback, shift, SelectedTimeframe);
      }

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (bb_handle == INVALID_HANDLE)
      {
         Print("Chưa khởi tạo chỉ báo");
         return NULL;
      }
      double bbUpper[], bbLower[], bbMiddle[];
      int copiedBBUpper = CopyBuffer(bb_handle, 1, shift, 2, bbUpper);   // Copy upper band from buffer 1
      int copiedBBMiddle = CopyBuffer(bb_handle, 0, shift, 1, bbMiddle); // Copy middle band from buffer 0
      int copiedBBLower = CopyBuffer(bb_handle, 2, shift, 2, bbLower);   // Copy lower band from buffer 2
      bands_low = bbLower[1];
      bands_mid = bbMiddle[0];
      bands_up = bbUpper[1];
      bands_upPrev = bbUpper[0];
      bands_lowPrev = bbLower[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = pricePrev < bands_lowPrev && price > bands_low;
      signals.sell = pricePrev > bands_upPrev && price < bands_up;
      signals.closeBuy = price >= bands_up || price <= bands_low;
      signals.closeSell = price <= bands_low || price >= bands_up;
      return signals;
   }
   bool IsSideWay(int shift)
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;
      double bw_now = handleValues.bands_up - handleValues.bands_low;
      double sum_bw = 0.0;
      int count = 0;

      for (int i = 1; i <= range; i++)
      {
         HandleValuesBase *baseValues = GetIndicatorValues(i);
         HandleValues *handleValues = (HandleValues *)baseValues;

         double bw = handleValues.bands_up - handleValues.bands_low;
         if (bw > 0)
         {
            sum_bw += bw;
            count++;
         }
      }

      if (count == 0)
         return false;

      double bw_avg = sum_bw / count;
      return bw_now < thresholdSideWay * bw_avg;
   }
};

// Global pointer instance for EA
HandleValues *g_handleValues = NULL;

//+------------------------------------------------------------------+
//| Expert initialization function                                    |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber);
   bb_handle = iBands(_Symbol, SelectedTimeframe, bbPeriod, bbShift, bbDeviation, PRICE_CLOSE);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (bb_handle != INVALID_HANDLE)
      IndicatorRelease(bb_handle);
      

   if (g_handleValues != NULL)
   {
      delete g_handleValues;
      g_handleValues = NULL;
   }
}

//+------------------------------------------------------------------+
//| Expert tick function                                              |
//+------------------------------------------------------------------+
void OnTick()
{
   tradeCustom.OnTick(StaticSignalHandler, OrderEntryOption, SelectedTimeframe);
}

//+------------------------------------------------------------------+
//| Static signal handler                                             |
//+------------------------------------------------------------------+
void StaticSignalHandler(double price, double currentLow, double currentHigh, int shift)
{
   if (g_handleValues != NULL)
   {
      bool isSideway = g_handleValues.IsSideWay(shift);
      if (isSideway)
      {
         g_handleValues.ProcessTickCommon(price, currentLow, currentHigh, shift);
         double bandlow = g_handleValues.bands_low;
         double bandup = g_handleValues.bands_up;
      }
      else
      {
         // Vẫn lấy indicator values và evaluate signals để check điều kiện đóng lệnh
         HandleValuesBase *baseValues = g_handleValues.GetIndicatorValues(shift);
         HandleValues *handleValues = (HandleValues *)baseValues;
         TradingSignals signals = g_handleValues.EvaluateTradingSignals(handleValues, price);

         // Chỉ đóng nếu điều kiện closeBuy/closeSell thỏa mãn
         tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
      }
   }
}
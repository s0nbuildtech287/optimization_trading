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
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int MA_Period = 20;                            //  MA Period
input ENUM_MA_METHOD ma_method = MODE_SMA;           // MA Method
input ENUM_APPLIED_PRICE SMA_Apply = PRICE_TYPICAL;  // MA Apply To

input ENUM_APPLIED_PRICE Applied_Price = PRICE_CLOSE; // Price type
input int OTT_Period = 2;                             // OTT Period
input double OTT_Percent = 1.4;                       // OTT Percent
input ENUM_MA_METHOD MA_Method = MODE_SMA;            // Moving Average Typ
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
double lowestSinceLastCross = 0.0;
double highestSinceLastCross = 0.0;
int lastRVICrossIndex = -1;
// Indicator handles
int ma_handle;
int ott_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double ottValue;
   double supportValue;
   double ottValuePrev;
   double supportValuePrev;
   double maValue;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(supportValue, ottValue, currentLow, currentHigh, stoploss, lowestSinceLastCross, highestSinceLastCross);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (ma_handle == INVALID_HANDLE || ott_handle == INVALID_HANDLE)
         return NULL;

      double maBuffer[], ottBuffe[], supportBuffe[];
      int copiedMa = CopyBuffer(ma_handle, 0, shift, 1, maBuffer);
      int copiedOtt = CopyBuffer(ott_handle, 1, shift, 2, ottBuffe);
      int copiedSupport = CopyBuffer(ott_handle, 0, shift, 2, supportBuffe);

      if (copiedMa < 1 || copiedOtt < 2 || copiedSupport < 2)
         return NULL;

      maValue = maBuffer[0];

      ottValue = ottBuffe[1];
      ottValuePrev = ottBuffe[0];

      supportValue = supportBuffe[1];
      supportValuePrev = supportBuffe[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = price > maValue && supportValue > ottValue && supportValuePrev < ottValuePrev;
      signals.sell = price < maValue && supportValue < ottValue && supportValuePrev > ottValuePrev;
      signals.closeBuy = supportValue <= ottValue;
      signals.closeSell = supportValue >= ottValue;

      return signals;
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
   ma_handle = iMA(_Symbol, SelectedTimeframe, MA_Period, 0, ma_method, SMA_Apply);
   ott_handle = iCustom(_Symbol, SelectedTimeframe, "optimized-trend-tracker-indicator-mt5", MA_Method, OTT_Period, OTT_Percent, true, false, Applied_Price);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000); // Đợi indicator khởi tạo xong
   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, ott_handle, 0, ott_handle, 1, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (ma_handle != INVALID_HANDLE)
      IndicatorRelease(ma_handle);
   if (ott_handle != INVALID_HANDLE)
      IndicatorRelease(ott_handle);
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
      g_handleValues.ProcessTickCommon(price, currentLow, currentHigh, shift);
}
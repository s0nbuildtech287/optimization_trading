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
input ENUM_MA_METHOD maFastMethod = MODE_SMA;        // Fast MA Method
input int maFastPeriod = 9;                          // Fast MA Period
input ENUM_MA_METHOD maSlowMethod = MODE_SMA;        // Slow MA Method
input int maSlowPeriod = 14;                         // Slow MA Period
input int rsxPeriod = 14;                            // RSX Period
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int maFast_handle;
int maSlow_handle;
int rsx_handle;
int lastRVICrossIndex = -1;
double lowestSinceLastCross = DBL_MAX;
double highestSinceLastCross = 0.0;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double maFastCurrent;
   double maFastPrev;
   double maSlowPrev;
   double maSlowCurrent;
   double rsxCurrent;
   double rsxPrev;
   double correcctedRSXCurrent;
   double correctedRSXPrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(rsxCurrent, correcctedRSXCurrent, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (maFast_handle == INVALID_HANDLE || maSlow_handle == INVALID_HANDLE || rsx_handle == INVALID_HANDLE)
         return NULL;
      double maFastBuffer[];
      double maSlowBuffer[];
      double rsxBuffer[];
      double correctedRSXBuffer[];
      int copiedMaFast = CopyBuffer(maFast_handle, 0, shift, 2, maFastBuffer);
      int copiedMaSlow = CopyBuffer(maSlow_handle, 0, shift, 2, maSlowBuffer);
      int copiedRSX = CopyBuffer(rsx_handle, 0, shift, 2, rsxBuffer);
      int copiedCorrectedRSX = CopyBuffer(rsx_handle, 2, shift, 2, correctedRSXBuffer);

      maFastCurrent = maFastBuffer[1];
      maFastPrev = maFastBuffer[0];
      maSlowCurrent = maSlowBuffer[1];
      maSlowPrev = maSlowBuffer[0];
      rsxCurrent = rsxBuffer[1];
      rsxPrev = rsxBuffer[0];
      correcctedRSXCurrent = correctedRSXBuffer[1];
      correctedRSXPrev = correctedRSXBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = maFastCurrent > maSlowCurrent &&
                    correcctedRSXCurrent < rsxCurrent && correctedRSXPrev > rsxPrev;
      signals.sell = maFastCurrent < maSlowCurrent &&
                     correcctedRSXCurrent > rsxCurrent && correctedRSXPrev < rsxPrev;
      signals.closeBuy = correcctedRSXCurrent >= rsxCurrent;
      signals.closeSell = correcctedRSXCurrent <= rsxCurrent;

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
   maFast_handle = iMA(_Symbol, SelectedTimeframe, maFastPeriod, 0, maFastMethod, PRICE_CLOSE);
   maSlow_handle = iMA(_Symbol, SelectedTimeframe, maSlowPeriod, 0, maSlowMethod, PRICE_CLOSE);
   rsx_handle = iCustom(_Symbol, SelectedTimeframe, "Corrected_RSX", rsxPeriod, PRICE_CLOSE);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, rsx_handle, 2, rsx_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (maFast_handle != INVALID_HANDLE)
      IndicatorRelease(maFast_handle);
   if (maSlow_handle != INVALID_HANDLE)
      IndicatorRelease(maSlow_handle);
   if (rsx_handle != INVALID_HANDLE)
      IndicatorRelease(rsx_handle);

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
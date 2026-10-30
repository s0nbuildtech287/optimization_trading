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
enum enMaTypes
{
   ma_sma,  // Simple moving average
   ma_ema,  // Exponential moving average
   ma_smma, // Smoothed MA
   ma_lwma  // Linear weighted MA
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
// Smoothed Heikin Ashi parameters for short term signals
input enMaTypes ShortSmoothMethod = ma_lwma; // Short SHA smoothing method
input int HeikinAshiShortPeriod = 10;        // Short SHA period
input int HeikinAshiShortStep = 1;           // Short SHA Step size

// Smoothed Heikin Ashi parameters for long trend
input enMaTypes LongSmoothMethod = ma_lwma; // Long SHA smoothing method
input int HeikinAshiLongPeriod = 30;        // Long SHA period
input int HeikinAshiLongStep = 1;           // Long SHA Step size

input bool HeikinAshiBetterFormula = false; // Use better formula for Heikin Ashi
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int longSHAHandle = INVALID_HANDLE;
int shortSHAHandle = INVALID_HANDLE;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double longheikinAshiColor;
   double shortheikinAshiColor;
   double shortheikinAshiColorPrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(1.5, shortheikinAshiColor, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double longheikinAshiColorBuffer[];
      double shortheikinAshiColorBuffer[];

      CopyBuffer(longSHAHandle, 4, shift, 1, longheikinAshiColorBuffer);
      CopyBuffer(shortSHAHandle, 4, shift, 2, shortheikinAshiColorBuffer);

      longheikinAshiColor = longheikinAshiColorBuffer[0];
      shortheikinAshiColor = shortheikinAshiColorBuffer[1];
      shortheikinAshiColorPrev = shortheikinAshiColorBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = (shortheikinAshiColor == 1.0) && (longheikinAshiColor == 1.0) && (shortheikinAshiColorPrev == 2.0);
      signals.sell = (shortheikinAshiColor == 2.0) && (longheikinAshiColor == 2.0) && (shortheikinAshiColorPrev == 1.0);
      signals.closeBuy = (shortheikinAshiColor == 2.0);
      signals.closeSell = (shortheikinAshiColor == 1.0);

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
   longSHAHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Heiken_Ashi_Smoothed.ex5",
                           HeikinAshiLongPeriod, LongSmoothMethod, HeikinAshiLongStep, HeikinAshiBetterFormula);
   shortSHAHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Heiken_Ashi_Smoothed.ex5",
                            HeikinAshiShortPeriod, ShortSmoothMethod, HeikinAshiShortStep, HeikinAshiBetterFormula);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, shortSHAHandle, 4, 1.0, 2.0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (longSHAHandle != INVALID_HANDLE)
      IndicatorRelease(longSHAHandle);
   if (shortSHAHandle != INVALID_HANDLE)
      IndicatorRelease(shortSHAHandle);
      

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
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
enum StopLossMethod
{
   SL_HEIKIN_ASHI, // Sử dụng High/Low của Heikin Ashi
   SL_MA           // Sử dụng Moving Average
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
// MA parameters - Sửa thành 200 theo yêu cầu
input int MaPeriod = 200;                              // MA period
input ENUM_MA_METHOD MaMethod = MODE_SMA;              // MA method
input ENUM_APPLIED_PRICE MaAppliedPrice = PRICE_CLOSE; // MA applied price

// Smoothed Heikin Ashi parameters - Sửa thành 10-10 theo yêu cầu
input int HeikinAshiMaPeriod = 10;          // Smoothing period for Heikin Ashi
input int HeikinAshiStep = 10;              // Step size for Heikin Ashi
input bool HeikinAshiBetterFormula = false; // Use better formula for Heikin Ashi
input StopLossMethod StopLossOption = SL_HEIKIN_ASHI;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int maHandle;
int heikinAshiHandle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double maValue;             // Moving Average value
   double heikinAshiColor;     // >0 = xanh, <0 = đỏ
   double heikinAshiColorPrev; // >0 = xanh, <0 = đỏ
   double priceHigh;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(1.5, heikinAshiColor, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double maBuffer[];
      double heikinAshiColorBuffer[];
      CopyBuffer(maHandle, 0, shift, 1, maBuffer);
      CopyBuffer(heikinAshiHandle, 4, shift, 2, heikinAshiColorBuffer);
      maValue = maBuffer[0];
      heikinAshiColor = heikinAshiColorBuffer[1];
      heikinAshiColorPrev = heikinAshiColorBuffer[0];
      priceHigh = iHigh(_Symbol, SelectedTimeframe, shift);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = (heikinAshiColor == 1.0 && heikinAshiColorPrev == 2.0 && price > maValue);
      signals.sell = (heikinAshiColor == 2.0 && heikinAshiColorPrev == 1.0 && priceHigh < maValue);
      signals.closeBuy = heikinAshiColor == 2.0;
      signals.closeSell = heikinAshiColor == 1.0;

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
   maHandle = iMA(_Symbol, SelectedTimeframe, MaPeriod, 0, MaMethod, MaAppliedPrice);
   heikinAshiHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Heiken_Ashi_Smoothed.ex5",
                              HeikinAshiMaPeriod, HeikinAshiStep, HeikinAshiBetterFormula);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, heikinAshiHandle, 4, 1.0, 2.0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (maHandle != INVALID_HANDLE)
      IndicatorRelease(maHandle);
   if (heikinAshiHandle != INVALID_HANDLE)
      IndicatorRelease(heikinAshiHandle);

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
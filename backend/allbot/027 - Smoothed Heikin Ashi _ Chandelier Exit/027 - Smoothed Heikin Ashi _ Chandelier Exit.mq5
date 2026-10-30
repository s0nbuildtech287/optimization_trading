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
   SL_TRADITIONAL,    // Traditional method (using high/low levels)
   SL_CHANDELIER_EXIT // Use Chandelier Exit
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
// Chandelier Exit parameters
input int AtrPeriod = 22;         // ATR period for Chandelier Exit
input double AtrMultiplier = 3.0; // ATR multiplier for Chandelier Exit
input int LookBackPeriod = 22;    // Look-back period for Chandelier Exit

// Smoothed Heikin Ashi parameters
input ENUM_MA_METHOD inpMaMetod = MODE_SMA; // Smoothing method
input int HeikinAshiMaPeriod = 7;           // Smoothing period for Heikin Ashi
input int HeikinAshiStep = 0;               // Step size for Heikin Ashi
input bool HeikinAshiBetterFormula = false; // Use better formula for Heikin Ashi
input StopLossMethod StopLossOption = SL_CHANDELIER_EXIT;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int heikinAshiHandle;
int chandelierHandle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double chandelierLong;      // Chandelier Exit long level
   double chandelierLongPrev;  // Chandelier Exit long level
   double chandelierShort;     // Chandelier Exit short level
   double chandelierShortPrev; // Chandelier Exit short level
   double heikinAshiColor;     // >0 = xanh, <0 = đỏ
   int chandelierTrend;        // 1 = long, -1 = short
   int chandelierTrendPrev;
   double prevClosePrice;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (StopLossOption)
      {
      case SL_TRADITIONAL:
         tradeCustom.UpdateSLUpDownValue(price, chandelierLong, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      case SL_CHANDELIER_EXIT:
      {
         if (AcceptBuy)
         {
            stoploss = chandelierLong;
         }
         else
         {
            stoploss = chandelierShort;
         }
         break;
      }
      default:
         break;
      }

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double uplBuffer[], dnlBuffer[], heikinAshiColorBuffer[];
      if (CopyBuffer(chandelierHandle, 0, shift, 2, uplBuffer) > 0 &&
          CopyBuffer(chandelierHandle, 1, shift, 2, dnlBuffer) > 0 &&
          CopyBuffer(heikinAshiHandle, 4, shift, 1, heikinAshiColorBuffer) > 0)
      {
         chandelierLong = uplBuffer[1];
         chandelierLongPrev = uplBuffer[0];
         chandelierShort = dnlBuffer[1];
         chandelierShortPrev = dnlBuffer[0];
         heikinAshiColor = heikinAshiColorBuffer[0];
         prevClosePrice = iClose(_Symbol, SelectedTimeframe, shift + 1);
      }

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = heikinAshiColor == 1.0 && (prevClosePrice < chandelierLongPrev && price > chandelierLong);
      signals.sell = heikinAshiColor == 2.0 && (prevClosePrice > chandelierShortPrev && price < chandelierShort);
      signals.closeBuy = heikinAshiColor == 2.0 || (price <= chandelierLong);
      signals.closeSell = heikinAshiColor == 1.0 || (price >= chandelierShort);

      return signals;
   }
   void CalculatePreviousLowestAndHighest(int shift)
   {
      int barsToCheck = 100;

      for (int i = barsToCheck; i > 0; i--)
      {
         HandleValuesBase *indiValues = GetIndicatorValues(i + shift);
         HandleValues *handleValues = (HandleValues *)indiValues;
         double currentLow = iLow(_Symbol, SelectedTimeframe, i + shift);
         double currentHigh = iHigh(_Symbol, SelectedTimeframe, i + shift);

         if (handleValues.chandelierTrend == -1) // Chandelier Exit Short
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (handleValues.chandelierTrend == 1) // Chandelier Exit Long
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
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
   heikinAshiHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Heiken_Ashi_Smoothed.ex5",
                              inpMaMetod, HeikinAshiMaPeriod, HeikinAshiStep, HeikinAshiBetterFormula);
   chandelierHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Chandelier_exit_027.ex5", AtrPeriod, AtrMultiplier, AtrMultiplier * 1.5, LookBackPeriod);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   g_handleValues.CalculatePreviousLowestAndHighest(shift);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (heikinAshiHandle != INVALID_HANDLE)
      IndicatorRelease(heikinAshiHandle);
   if (chandelierHandle != INVALID_HANDLE)
      IndicatorRelease(chandelierHandle);

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
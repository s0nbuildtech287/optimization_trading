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
enum ChoiceSL
{
   SL_AT_HEIKEN = 0, // Stop Loss at Heiken Ashi(0)
   SL_AT_MACD = 1,   // Stop Loss at cross MACD(1)
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int fastPeriod = 3;                            // Fast Period for VEMA
input int slowPeriod = 10;                           // Slow Period for VEMA
input int signalPeriod = 5;                          // Signal Period for VEMA
input ENUM_APPLIED_PRICE appliedPrice = PRICE_CLOSE; // Applied Price for VEMA
input int smoothPeriod = 3;                          // Smooth Period for HEIKEN ASHI
input ENUM_MA_METHOD maMethod = MODE_SMA;            // MA Method for HEIKEN ASHI
input int stepSize = 1;                              // Step size for Heiken Ashi
input ChoiceSL stopLossChoice = SL_AT_HEIKEN;        // Stop Loss choice
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int lastRVICrossIndex = -1;
double lowestSinceLastCross = DBL_MAX;
double highestSinceLastCross = 0.0;
// Indicator handles
int vema_handle;
int henken_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double vvMACD;
   double vvMACD_Prev;
   double vvMACD_PrevPrev;
   double vvMACDSignal;
   double vvMACDSignal_Prev;
   double vvMACDSignal_PrevPrev;
   double heiken_value;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (stopLossChoice)
      {
      case SL_AT_HEIKEN:
         tradeCustom.UpdateSLUpDownValue(1.5, heiken_value, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      case SL_AT_MACD:
         tradeCustom.UpdateSLUpDownValue(vvMACD, vvMACDSignal, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      }
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (vema_handle == INVALID_HANDLE)
      {
         Print("VEMA MACD handle is invalid");
         return NULL;
      }
      if (henken_handle == INVALID_HANDLE)
      {
         Print("Heiken Ashi handle is invalid");
         return NULL;
      }
      double vvMACDValues[];
      double vvMACDSignalValues[];
      double heikenValues[];
      int copiedvvMACD = CopyBuffer(vema_handle, 2, shift, 3, vvMACDValues);
      int copiedvvMACDSignal = CopyBuffer(vema_handle, 3, shift, 3, vvMACDSignalValues);
      int copiedHeiken = CopyBuffer(henken_handle, 4, shift, 1, heikenValues);

      vvMACD = vvMACDValues[2];
      vvMACDSignal = vvMACDSignalValues[2];
      vvMACD_Prev = vvMACDValues[1];
      vvMACDSignal_Prev = vvMACDSignalValues[1];
      vvMACD_PrevPrev = vvMACDValues[0];
      vvMACDSignal_PrevPrev = vvMACDSignalValues[0];
      heiken_value = heikenValues[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = heiken_value == 1.0 && vvMACD > vvMACDSignal && vvMACD_Prev < vvMACDSignal_Prev;
      signals.sell = heiken_value == 2.0 && vvMACD < vvMACDSignal && vvMACD_Prev > vvMACDSignal_Prev;
      signals.closeBuy = vvMACD <= vvMACDSignal;
      signals.closeSell = vvMACD >= vvMACDSignal;

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
   vema_handle = iCustom(_Symbol, SelectedTimeframe, "vema_macd", fastPeriod, slowPeriod, signalPeriod, appliedPrice);
   henken_handle = iCustom(_Symbol, SelectedTimeframe, "Heiken_Ashi_Smoothed", smoothPeriod, maMethod, stepSize);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000); // Đợi một chút để đảm bảo các indicator đã sẵn sàng
   switch (stopLossChoice)
   {
   case SL_AT_HEIKEN:
      tradeCustom.CalculatePreviousLowestAndHighestValue(shift, henken_handle, 4, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
      break;
   case SL_AT_MACD:
      tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, vema_handle, 2, vema_handle, 3, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
      break;
   default:
      break;
   }

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (vema_handle != INVALID_HANDLE)
      IndicatorRelease(vema_handle);
   if (henken_handle != INVALID_HANDLE)
      IndicatorRelease(henken_handle);

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
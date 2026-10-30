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
input int ma1Period = 50;                            // Period for the first EMA
input ENUM_APPLIED_PRICE ma1Price = PRICE_CLOSE;     // Price type for the first EMA
input int ma2Period = 200;                           // Period for the second EMA
input ENUM_APPLIED_PRICE ma2Price = PRICE_CLOSE;     // Price type for the second EMA
input int LongLength = 20;                           // Length long  for the SMI
input int ShortLength = 5;                           // Length short for the SMI
input int SignalLength = 5;                          // Signal length for the SMI
input double smiLevel = 0.1;                         // SMI level
int ma1_handle;
int ma2_handle;
int smi_handle;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

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
   double ma1Current;
   double ma2Current;
   double ma1Prev;
   double ma2Prev;
   double smiCurrent;
   double smiPrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(smiCurrent, smiLevel, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (ma1_handle == INVALID_HANDLE || ma2_handle == INVALID_HANDLE || smi_handle == INVALID_HANDLE)
      {
         Print("Error getting handle for MA1, MA2 or SMI: ", GetLastError());
         return NULL;
      }
      double ma1Buffer[];
      double ma2Buffer[];
      double smiBuffer[];
      int copiedMA1 = CopyBuffer(ma1_handle, 0, shift, 2, ma1Buffer);
      int copiedMA2 = CopyBuffer(ma2_handle, 0, shift, 2, ma2Buffer);
      int copiedSMI = CopyBuffer(smi_handle, 0, shift, 2, smiBuffer);
      if (copiedMA1 <= 0 || copiedMA2 <= 0 || copiedSMI <= 0)
      {
         Print("Error copying buffer: ", GetLastError());
         return NULL;
      }
      ma1Current = ma1Buffer[1];
      ma1Prev = ma1Buffer[0];
      ma2Current = ma2Buffer[1];
      ma2Prev = ma2Buffer[0];
      smiCurrent = smiBuffer[1];
      smiPrev = smiBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = ma1Current > ma2Current && smiCurrent > smiLevel && smiPrev < smiLevel;
      signals.sell = ma1Current < ma2Current && smiCurrent < smiLevel && smiPrev > smiLevel;
      signals.closeBuy = smiCurrent <= smiLevel;
      signals.closeSell = smiCurrent >= smiLevel;

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
   ma1_handle = iMA(_Symbol, SelectedTimeframe, ma1Period, 0, MODE_EMA, ma1Price);
   ma2_handle = iMA(_Symbol, SelectedTimeframe, ma2Period, 0, MODE_EMA, ma2Price);
   smi_handle = iCustom(_Symbol, SelectedTimeframe, "SMIErgodicOscillator", LongLength, ShortLength, SignalLength);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, smi_handle, 0, smiLevel, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (ma1_handle != INVALID_HANDLE)
      IndicatorRelease(ma1_handle);
   if (ma2_handle != INVALID_HANDLE)
      IndicatorRelease(ma2_handle);
   if (smi_handle != INVALID_HANDLE)
      IndicatorRelease(smi_handle);

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
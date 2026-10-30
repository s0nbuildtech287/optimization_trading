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
input int MA_Period = 200;                           //  MA Period
input ENUM_MA_METHOD ma_method = MODE_SMA;           //  MA Method
input ENUM_APPLIED_PRICE SMA_Apply = PRICE_TYPICAL;  // SMA Apply To
input int Vidya_1_Period = 9;                        //  Vidya_1_Period
input int Vidya_2_Period = 14;                       //  Vidya_2_Period

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int MA_handle;
int vidya_handle_14;
int vidya_handle_9;
double lowestSinceLastCross = 0.0;
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
   double ma_value;
   double vidya_14_value;
   double vidya_9_value;
   double vidya_14Prev_value;
   double vidya_9Prev_value;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(vidya_9_value, vidya_14_value, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double maBuffer[];
      double vidyaBuffer14[];
      double vidyaBuffer9[];
      int copiedMA = CopyBuffer(MA_handle, 0, shift, 1, maBuffer);
      int copiedVidya14 = CopyBuffer(vidya_handle_14, 0, shift, 2, vidyaBuffer14);
      int copiedVidya9 = CopyBuffer(vidya_handle_9, 0, shift, 2, vidyaBuffer9);
      ma_value = maBuffer[0];
      vidya_14_value = vidyaBuffer14[1];
      vidya_9_value = vidyaBuffer9[1];
      vidya_14Prev_value = vidyaBuffer14[0];
      vidya_9Prev_value = vidyaBuffer9[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (price > ma_value) && (vidya_9_value > vidya_14_value) && (vidya_9Prev_value < vidya_14Prev_value);
      signals.sell = (price < ma_value) && (vidya_9_value < vidya_14_value) && (vidya_9Prev_value > vidya_14Prev_value);
      signals.closeBuy = (vidya_9_value <= vidya_14_value);
      signals.closeSell = (vidya_9_value >= vidya_14_value);

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
   MA_handle = iMA(_Symbol, SelectedTimeframe, MA_Period, 0, ma_method, SMA_Apply);
   vidya_handle_9 = iCustom(_Symbol, SelectedTimeframe, "Vidya", Vidya_1_Period, 0);
   vidya_handle_14 = iCustom(_Symbol, SelectedTimeframe, "Vidya", Vidya_2_Period, 0);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, vidya_handle_9, 0, vidya_handle_14, 0, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (MA_handle != INVALID_HANDLE)
      IndicatorRelease(MA_handle);
   if (vidya_handle_9 != INVALID_HANDLE)
      IndicatorRelease(vidya_handle_9);
   if (vidya_handle_14 != INVALID_HANDLE)
      IndicatorRelease(vidya_handle_14);

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
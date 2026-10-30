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
// phần input của chỉ báo stdDev
input int stdDev_Period = 20;
input ENUM_MA_METHOD stDev_Method = MODE_SMA;
input int stdDev_Value = 500;
// phần input của chỉ báo stdDev
input int rvi_Period = 10;
// Runtime globals
double stoploss = 0.0;
double lowestSinceLastCross = 0.0;
double highestSinceLastCross = 0.0;
int lastRVICrossIndex;

// Indicator handles
int stdDev_handle;
int rvi_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double stdDevValue;
   double rviMainLine;
   double rviMainLinePrev;
   double rviSignalLine;
   double rviSignalLinePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(rviMainLine, rviSignalLine, currentLow, currentHigh, stoploss, lowestSinceLastCross, highestSinceLastCross);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double stdDevBuffer[];
      double rviMainBuffer[];
      double rviSignalBuffer[];
      int copied_stdDev = CopyBuffer(stdDev_handle, 0, shift, 1, stdDevBuffer);
      int copied_rviMain = CopyBuffer(rvi_handle, 0, shift, 2, rviMainBuffer);
      int copied_rviSignal = CopyBuffer(rvi_handle, 1, shift, 2, rviSignalBuffer);

      stdDevValue = stdDevBuffer[0];
      rviMainLine = rviMainBuffer[1];
      rviMainLinePrev = rviMainBuffer[0];
      rviSignalLine = rviSignalBuffer[1];
      rviSignalLinePrev = rviSignalBuffer[0];
      Print(stdDev_Value);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = stdDevValue > stdDev_Value &&
                    rviMainLine > rviSignalLine &&
                    rviMainLinePrev < rviSignalLinePrev;

      signals.closeBuy = rviMainLine <= rviSignalLine;

      signals.sell = stdDevValue < stdDev_Value &&
                     rviMainLine < rviSignalLine &&
                     rviMainLinePrev > rviSignalLinePrev;

      signals.closeSell = rviMainLine >= rviSignalLine;

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
   stdDev_handle = iStdDev(_Symbol, SelectedTimeframe, stdDev_Period, 0, stDev_Method, PRICE_CLOSE);
   rvi_handle = iRVI(_Symbol, SelectedTimeframe, rvi_Period);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);

   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, rvi_handle, 0, rvi_handle, 1, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (stdDev_handle != INVALID_HANDLE)
      IndicatorRelease(stdDev_handle);
   if (rvi_handle != INVALID_HANDLE)
      IndicatorRelease(rvi_handle);

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
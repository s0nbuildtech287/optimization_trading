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
input int KPeriod = 5;                               // %K Period for the Stochastic indicator
input int DPeriod = 3;                               // %D Period for the Stochastic indicator
input int Slowing = 3;                               // Slowing for the Stochastic indicator
input ENUM_STO_PRICE priceStochastic = STO_LOWHIGH;  // Price type for the Stochastic indicator
input ENUM_MA_METHOD methodStochastic = MODE_SMA;    // MA method for the Stochastic indicator
input int BuyLevel = 20;                             // Buy level for the Stochastic indicator
input int SellLevel = 80;                            // Sell level for the Stochastic indicator
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int lastRVICrossIndex = -1;
double lowestSinceLastCross = DBL_MAX;
double highestSinceLastCross = 0.0;
// Indicator handles
int osciallator_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double stoch_valueCurrent;
   double stoch_valuePrevious;
   double stoch_signalCurrent;
   double stoch_signalPrevious;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(stoch_valueCurrent, stoch_signalCurrent, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (osciallator_handle == INVALID_HANDLE)
      {
         Print("Invalid handle");
         return NULL;
      }
      double stoch_valueBuffer[];
      double stoch_signalBuffer[];
      double stoch_rangeBuffer[];
      int copiedStochValue = CopyBuffer(osciallator_handle, 0, shift, 2, stoch_valueBuffer);
      int copiedStochSignal = CopyBuffer(osciallator_handle, 1, shift, 2, stoch_signalBuffer);

      stoch_valueCurrent = stoch_valueBuffer[1];
      stoch_signalCurrent = stoch_signalBuffer[1];
      stoch_valuePrevious = stoch_valueBuffer[0];
      stoch_signalPrevious = stoch_signalBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = stoch_valueCurrent > stoch_signalCurrent && stoch_valuePrevious < stoch_signalPrevious && stoch_valueCurrent < BuyLevel;
      signals.sell = stoch_valueCurrent < stoch_signalCurrent && stoch_valuePrevious > stoch_signalPrevious && stoch_valueCurrent > SellLevel;
      signals.closeBuy = stoch_valueCurrent <= stoch_signalCurrent;
      signals.closeSell = stoch_valueCurrent >= stoch_signalCurrent;
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
   osciallator_handle = iStochastic(_Symbol, SelectedTimeframe, KPeriod, DPeriod, Slowing, methodStochastic, priceStochastic);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, osciallator_handle, 0, osciallator_handle, 1, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (osciallator_handle != INVALID_HANDLE)
      IndicatorRelease(osciallator_handle);
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
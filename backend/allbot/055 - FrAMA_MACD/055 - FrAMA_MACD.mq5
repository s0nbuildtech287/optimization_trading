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
input int frAmaPeriod = 14;                          // FrAMA period
input int indicatorshift = 0;                        // FrAMA Indicator shift

input int fastEmaPeriod = 12;                        // Fast EMA period for MACD
input int slowEmaPeriod = 26;                        // Slow EMA period for MACD
input int signalPeriod = 9;                          // Signal period for MACD
input ENUM_APPLIED_PRICE appliedPrice = PRICE_CLOSE; // Price type for MACD
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int framaHandle;
int macdHandle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double framaValue;
   double framaValuePrev;
   double macdValueCurrent;
   double macdValuePrev;
   double macdSignalPrev;
   double macdSignalCurrent;
   double pricePrev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(macdSignalCurrent, 0, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (framaHandle == 0 || macdHandle == 0)
      {
         Print("Failed to get indicator  Error: ", GetLastError());
         return NULL;
      }
      double framaValueBuffer[];
      double macdValueBuffer[];
      double macdSignalValueBuffer[];
      double copied_frama = CopyBuffer(framaHandle, 0, shift, 2, framaValueBuffer);
      double copied_macd = CopyBuffer(macdHandle, 0, shift, 2, macdValueBuffer);
      double copied_macd_signal = CopyBuffer(macdHandle, 1, shift, 2, macdSignalValueBuffer);

      framaValue = framaValueBuffer[1];
      framaValuePrev = framaValueBuffer[0];
      macdValuePrev = macdValueBuffer[0];
      macdValueCurrent = macdValueBuffer[1];
      macdSignalCurrent = macdSignalValueBuffer[1];
      macdSignalPrev = macdSignalValueBuffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = framaValue < price && framaValuePrev > pricePrev && macdSignalCurrent > 0;
      signals.sell = framaValue > price && framaValuePrev < pricePrev && macdSignalCurrent < 0;
      signals.closeBuy = macdSignalCurrent < 0 || framaValue >= price;
      signals.closeSell = macdSignalCurrent > 0 || framaValue <= price;
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
   framaHandle = iCustom(_Symbol, SelectedTimeframe, "Examples//FrAMA", frAmaPeriod, indicatorshift);
   macdHandle = iMACD(_Symbol, SelectedTimeframe, fastEmaPeriod, slowEmaPeriod, signalPeriod, appliedPrice);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, macdHandle, 1, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (framaHandle != INVALID_HANDLE)
      IndicatorRelease(framaHandle);
   if (macdHandle != INVALID_HANDLE)
      IndicatorRelease(macdHandle);

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
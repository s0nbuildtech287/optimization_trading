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
input double lotThreshold = 0;                            // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                           // Magic number for the EA
input double riskMoney = 100;                             // Risk Money
input bool AcceptBuy = true;                              // Enable Buy Orders
input bool AcceptSell = false;                            // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;      // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;        // Order Entry Mode
input int AMA_Period = 14;                                // AMA period
input int ama_fast_ma_period = 1;                         // Fast MA period
input int ama_slow_ma_period = 30;                        // Slow MA period
input ENUM_APPLIED_PRICE ama_applied_price = PRICE_CLOSE; // Applied price for AMA
input int StoplossBars = 50;                              // Number of bars for Stoploss
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ama_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double amaCurrent;
   double amaPrevious;
   double pricePrevious;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      if (signals.buy && AcceptBuy)
         stoploss = tradeCustom.CalculateDynamicStoploss(true, StoplossBars, shift, SelectedTimeframe);
      else if (signals.sell && AcceptSell)
         stoploss = tradeCustom.CalculateDynamicStoploss(false, StoplossBars, shift, SelectedTimeframe);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (ama_handle == INVALID_HANDLE)
      {
         Print("Invalid AMA handle");
         return NULL;
      }
      double amaBuffer[];
      CopyBuffer(ama_handle, 0, shift, 2, amaBuffer);

      amaCurrent = amaBuffer[1];
      amaPrevious = amaBuffer[0];
      pricePrevious = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (price > amaCurrent) && (pricePrevious < amaPrevious);
      signals.sell = (price < amaCurrent) && (pricePrevious > amaPrevious);
      signals.closeBuy = (price <= amaCurrent);
      signals.closeSell = (price >= amaCurrent);

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
   ama_handle = iAMA(_Symbol, SelectedTimeframe, AMA_Period, ama_fast_ma_period, ama_slow_ma_period, 0, ama_applied_price);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (ama_handle != INVALID_HANDLE)
      IndicatorRelease(ama_handle);

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
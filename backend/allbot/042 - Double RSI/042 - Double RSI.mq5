//+------------------------------------------------------------------+
//|                        Copyright 2025, LotusQuant                  |
//|                        https://LotusQuant.com                      |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2025, LotusQuant"
#property link "https://LotusQuant.com"
#property version "1.00"
#include <Trade/LotusQuantLibrary.mqh>
CTradeCustomEx tradeCustom;

// Inputs
input double lotThreshold = 0;                                // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                               // Magic number for the EA
input double riskMoney = 100;                                 // Risk Money
input bool AcceptBuy = true;                                  // Enable Buy Orders
input bool AcceptSell = false;                                // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;          // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;            // Order Entry Mode
input int rsiFast_period = 2;                                 // RSI period for RSI Fast
input ENUM_APPLIED_PRICE rsiFast_applied_price = PRICE_CLOSE; // Applied price for RSI Fast
input int rsiSlow_period = 2;                                 // RSI period for RSI Slow
input ENUM_APPLIED_PRICE rsiSlow_applied_price = PRICE_CLOSE; // Applied price for RSI Slow
input double rsiLevelFast = 70.0;                             // RSI Fast level
input double rsiLevelSlow = 30.0;                             // RSI Slow level
input int stoplossLookback = 50;                              // Number of candles to look back for stoploss

// Global runtime variables
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int rsiFast_handle = INVALID_HANDLE;
int rsiSlow_handle = INVALID_HANDLE;

// Class definition
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator state values
   double rsiFast_value;
   double rsiFastPrev_value;
   double rsiSlowPrev_value;
   double rsiSlow_value;

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      if (signals.buy && AcceptBuy)
         stoploss = CalculateDynamicStoploss(true, stoplossLookback, shift);
      else if (signals.sell && AcceptSell)
         stoploss = CalculateDynamicStoploss(false, stoplossLookback, shift);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (rsiFast_handle == INVALID_HANDLE || rsiSlow_handle == INVALID_HANDLE)
      {
         Print("RSI handles are not initialized.");
         return NULL;
      }

      double rsiBufferFast[];
      double rsiBufferSlow[];

      if (CopyBuffer(rsiFast_handle, 0, shift, 2, rsiBufferFast) <= 0 ||
          CopyBuffer(rsiSlow_handle, 0, shift, 2, rsiBufferSlow) <= 0)
      {
         Print("Failed to copy RSI buffers.");
         return NULL;
      }

      // Preserve original mapping: value = [1], prev_value = [0]
      rsiFast_value = rsiBufferFast[1];
      rsiFastPrev_value = rsiBufferFast[0];
      rsiSlow_value = rsiBufferSlow[1];
      rsiSlowPrev_value = rsiBufferSlow[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = rsiFast_value > rsiLevelFast && rsiSlow_value > rsiLevelSlow &&
                    rsiFastPrev_value < rsiLevelFast;
      signals.sell = rsiFast_value < rsiLevelFast && rsiSlow_value < rsiLevelSlow &&
                     rsiFastPrev_value > rsiLevelFast;
      signals.closeBuy = rsiFast_value <= rsiLevelFast;
      signals.closeSell = rsiFast_value >= rsiLevelFast;

      return signals;
   }

   double CalculateDynamicStoploss(bool isBuyOrder, int lookbackPeriod, int shift)
   {
      double stoplossPrice = 0.0;

      if (isBuyOrder)
      {
         double lowestLow = iLow(_Symbol, SelectedTimeframe, shift + 1);

         for (int i = 1; i <= lookbackPeriod; i++)
         {
            double currentLow = iLow(_Symbol, SelectedTimeframe, i);
            if (currentLow < lowestLow)
               lowestLow = currentLow;
         }
         stoplossPrice = lowestLow;
      }
      else
      {
         double highestHigh = iHigh(_Symbol, SelectedTimeframe, shift + 1);

         for (int i = 1; i <= lookbackPeriod; i++)
         {
            double currentHigh = iHigh(_Symbol, SelectedTimeframe, i);
            if (currentHigh > highestHigh)
               highestHigh = currentHigh;
         }
         stoplossPrice = highestHigh;
      }

      return stoplossPrice;
   }
};

// Global pointer instance (declared after class)
HandleValues *g_handleValues = NULL;

// Lifecycle functions
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber); // Gán Magic Number cho EA

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   rsiFast_handle = iRSI(_Symbol, SelectedTimeframe, rsiFast_period, rsiFast_applied_price);
   rsiSlow_handle = iRSI(_Symbol, SelectedTimeframe, rsiSlow_period, rsiSlow_applied_price);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (rsiFast_handle != INVALID_HANDLE)
      IndicatorRelease(rsiFast_handle);
   if (rsiSlow_handle != INVALID_HANDLE)
      IndicatorRelease(rsiSlow_handle);
   if (g_handleValues != NULL)
   {
      delete g_handleValues;
      g_handleValues = NULL;
   }
}

void OnTick()
{
   tradeCustom.OnTick(StaticSignalHandler, OrderEntryOption, SelectedTimeframe);
}

void StaticSignalHandler(double price, double currentLow, double currentHigh, int shift)
{
   if (g_handleValues != NULL)
      g_handleValues.ProcessTickCommon(price, currentLow, currentHigh, shift);
}
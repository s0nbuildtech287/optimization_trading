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

// Inputs (keep unchanged)
input double lotThreshold = 0;                               // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                              // Magic number for the EA
input double riskMoney = 100;                                // Risk Money
input bool AcceptBuy = true;                                 // Enable Buy Orders
input bool AcceptSell = false;                               // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;         // Selected Timeframe for the EA
input ENUM_TIMEFRAMES SelectedTimeframeHTF = PERIOD_H4;      // Selected Timeframe for the HTF
input ENUM_TIMEFRAMES SelectedTimeframeLTF = PERIOD_H1;      // Selected Timeframe for the LTF
input OrderEntryMode OrderEntryOption = ENTRY_ATO;           // Order Entry Mode
input int cciHTF_period = 2;                                 // CCI period for CCI HTF
input ENUM_APPLIED_PRICE cciHTF_applied_price = PRICE_CLOSE; // Applied price for CCI HTF
input int cciLTF_period = 2;                                 // CCI period for CCI LTF
input ENUM_APPLIED_PRICE cciLTF_applied_price = PRICE_CLOSE; // Applied price for CCI LTF
input double cciLevelHTF = 70.0;                             // CCI HTF  level
input double cciLevelLTF = 30.0;                             // CCI LTF  level
input int stoplossLookback = 50;                             // Number of candles to look back for stoploss

// Runtime globals and indicator handles
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

int cciHTF_handle = INVALID_HANDLE;
int cciLTF_handle = INVALID_HANDLE;

// Class definition
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator state values
   double cciHTF_value;
   double cciHTFPrev_value;
   double cciLTF_value;
   double cciLTFPrev_value;

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
      if (cciHTF_handle == INVALID_HANDLE || cciLTF_handle == INVALID_HANDLE)
      {
         Print("CCI handles are not initialized.");
         return NULL;
      }

      double cciBufferHTF[];
      double cciBufferLTF[];

      if (CopyBuffer(cciHTF_handle, 0, shift, 2, cciBufferHTF) <= 0 ||
          CopyBuffer(cciLTF_handle, 0, shift, 2, cciBufferLTF) <= 0)
      {
         Print("Failed to copy CCI buffers.");
         return NULL;
      }

      // Keep original mapping
      cciHTF_value = cciBufferHTF[1];
      cciHTFPrev_value = cciBufferHTF[0];
      cciLTF_value = cciBufferLTF[1];
      cciLTFPrev_value = cciBufferLTF[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = cciHTF_value > cciLevelHTF && cciLTF_value > cciLevelLTF &&
                    cciLTFPrev_value < cciLevelLTF;

      signals.sell = cciHTF_value < cciLevelHTF && cciLTF_value < cciLevelLTF &&
                     cciLTFPrev_value > cciLevelLTF;

      signals.closeBuy = cciLTF_value <= cciLevelLTF;
      signals.closeSell = cciLTF_value >= cciLevelLTF;

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

// Global pointer instance for EA
HandleValues *g_handleValues = NULL;

// Lifecycle functions
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber); // Gán Magic Number cho EA

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   cciHTF_handle = iCCI(_Symbol, SelectedTimeframeHTF, cciHTF_period, cciHTF_applied_price);
   cciLTF_handle = iCCI(_Symbol, SelectedTimeframeLTF, cciLTF_period, cciLTF_applied_price);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (cciHTF_handle != INVALID_HANDLE)
      IndicatorRelease(cciHTF_handle);
   if (cciLTF_handle != INVALID_HANDLE)
      IndicatorRelease(cciLTF_handle);
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
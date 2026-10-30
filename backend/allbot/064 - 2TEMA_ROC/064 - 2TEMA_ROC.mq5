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
input int temaFastPeriod = 10;                       // TEMA Fast Period
input int temaSlowPeriod = 50;                       // TEMA Slow Period
input int rocPeriod = 14;                            // ROC Period
input int rocLevel = 0;                              // ROC Level
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int temaFastHandle = INVALID_HANDLE;
int temaSlowHandle = INVALID_HANDLE;
int rocHandle = INVALID_HANDLE;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double temaFast;
   double temaSlow;
   double roc;
   double rocPrev;
   double pricePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(roc, rocLevel, currentLow, currentHigh, stoploss, highestPriceDuringGreen, lowestPriceDuringRed);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      // Kiểm tra handle hợp lệ
      if (temaFastHandle == INVALID_HANDLE || temaSlowHandle == INVALID_HANDLE || rocHandle == INVALID_HANDLE)
         return NULL;

      double temaFastBuffer[], temaSlowBuffer[], rocBuffer[];

      if (CopyBuffer(temaFastHandle, 0, shift, 1, temaFastBuffer) < 0)
         return NULL;
      if (CopyBuffer(temaSlowHandle, 0, shift, 1, temaSlowBuffer) < 0)
         return NULL;
      if (CopyBuffer(rocHandle, 0, shift, 2, rocBuffer) < 0)
         return NULL;

      temaFast = temaFastBuffer[0];
      temaSlow = temaSlowBuffer[0];
      roc = rocBuffer[1];
      rocPrev = rocBuffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (temaFast > temaSlow &&
                     rocPrev < rocLevel && roc > rocLevel);

      signals.sell = (temaFast < temaSlow &&
                      rocPrev > rocLevel && roc < rocLevel);

      signals.closeBuy = (roc <= rocLevel);

      signals.closeSell = (roc >= rocLevel);

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
   temaFastHandle = iTEMA(_Symbol, SelectedTimeframe, temaFastPeriod, 0, PRICE_CLOSE);
   temaSlowHandle = iTEMA(_Symbol, SelectedTimeframe, temaSlowPeriod, 0, PRICE_CLOSE);
   rocHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Examples\\ROC", rocPeriod, PRICE_CLOSE);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, rocHandle, 0, rocLevel, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (temaFastHandle != INVALID_HANDLE)
      IndicatorRelease(temaFastHandle);
   if (temaSlowHandle != INVALID_HANDLE)
      IndicatorRelease(temaSlowHandle);
   if (rocHandle != INVALID_HANDLE)
      IndicatorRelease(rocHandle);

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
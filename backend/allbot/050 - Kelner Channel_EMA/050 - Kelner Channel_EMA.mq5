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
input int KeltnerEMAPeriod = 20;                     // Keltner EMA Period
input int KeltnerATRPeriod = 10;                     // Keltner ATR Period
input double KeltnerATRFactor = 2.0;                 // Keltner ATR Multiplier
input int EMA_Period = 200;                          // EMA Period for Trend

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int keltnerHandle = INVALID_HANDLE;
int emaHandle = INVALID_HANDLE;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double ema200;
   double keltnerUpper;
   double keltnerMiddle;
   double keltnerMiddlePrev;
   double keltnerLower;
   double pricePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (AcceptBuy && signals.buy)
         stoploss = keltnerLower;
      else if (AcceptSell && signals.sell)
         stoploss = keltnerUpper;
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (keltnerHandle == INVALID_HANDLE || emaHandle == INVALID_HANDLE)
         return NULL;
      double keltnerUpperBuffer[], keltnerMiddleBuffer[], keltnerLowerBuffer[], emaBuffer[];

      int copiedKeltnerUpper = CopyBuffer(keltnerHandle, 0, shift, 1, keltnerUpperBuffer);
      int copiedKeltnerMiddle = CopyBuffer(keltnerHandle, 1, shift, 2, keltnerMiddleBuffer);
      int copiedKeltnerLower = CopyBuffer(keltnerHandle, 2, shift, 1, keltnerLowerBuffer);
      int copiedEma = CopyBuffer(emaHandle, 0, shift, 1, emaBuffer);

      if (copiedKeltnerUpper <= 0 || copiedKeltnerMiddle <= 0 || copiedKeltnerLower <= 0 || copiedEma <= 0)
         return NULL;

      keltnerUpper = keltnerUpperBuffer[0];
      keltnerMiddle = keltnerMiddleBuffer[1];
      keltnerMiddlePrev = keltnerMiddleBuffer[0];
      keltnerLower = keltnerLowerBuffer[0];
      ema200 = emaBuffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = price > ema200 && price > keltnerMiddle && pricePrev < keltnerMiddlePrev;
      signals.sell = price < ema200 && price < keltnerMiddle && pricePrev > keltnerMiddlePrev;
      signals.closeBuy = price <= keltnerMiddle;
      signals.closeSell = price >= keltnerMiddle;

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
   keltnerHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Free Indicators\\Keltner Channel",
                           KeltnerEMAPeriod, KeltnerATRPeriod, KeltnerATRFactor, false);
   emaHandle = iMA(_Symbol, SelectedTimeframe, EMA_Period, 0, MODE_EMA, PRICE_CLOSE);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighest(shift, emaHandle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (keltnerHandle != INVALID_HANDLE)
      IndicatorRelease(keltnerHandle);
   if (emaHandle != INVALID_HANDLE)
      IndicatorRelease(emaHandle);

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
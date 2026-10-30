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
input int CCI_Period = 14;                           // CCI Period for the CCI indicator
input int ATR_Period = 14;                           // ATR Period for the ATR indicator
input ENUM_MA_METHOD ForceMAMethod = MODE_SMA;       // Force MA Method
input ENUM_APPLIED_VOLUME ForceVolume = VOLUME_TICK; // Force MA Volume
input int forcePeriod = 13;                          // Force Period
input int foLevel = 0;                               // Force Index level for signals

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int lastRVICrossIndex = -1;
double lowestSinceLastCross = DBL_MAX;
double highestSinceLastCross = 0.0;
// Indicator handles
int forceIndex_handle;
int trendMagic_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double trendmagic_value;
   double force_now;
   double force_prev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(force_now, foLevel, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (forceIndex_handle == INVALID_HANDLE || trendMagic_handle == INVALID_HANDLE)
      {
         Print("Invalid handle");
         return NULL;
      }

      double trendMagicBuffer[];
      double force_buf[];
      int copiedtrendMagic = CopyBuffer(trendMagic_handle, 1, shift, 1, trendMagicBuffer);
      int copiedForce = CopyBuffer(forceIndex_handle, 0, shift, 2, force_buf);

      trendmagic_value = trendMagicBuffer[0];
      force_now = force_buf[1];
      force_prev = force_buf[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = trendmagic_value == 0.0 && force_now > foLevel && force_prev < foLevel;
      signals.sell = trendmagic_value == 1.0 && force_now < foLevel && force_prev > foLevel;
      signals.closeBuy = force_now <= foLevel;
      signals.closeSell = force_now >= foLevel;

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
   trendMagic_handle = iCustom(_Symbol, SelectedTimeframe, "trendmagic", CCI_Period, ATR_Period);
   forceIndex_handle = iForce(_Symbol, SelectedTimeframe, forcePeriod, ForceMAMethod, ForceVolume);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, forceIndex_handle, 0, foLevel, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (forceIndex_handle != INVALID_HANDLE)
      IndicatorRelease(forceIndex_handle);
   if (trendMagic_handle != INVALID_HANDLE)
      IndicatorRelease(trendMagic_handle);

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
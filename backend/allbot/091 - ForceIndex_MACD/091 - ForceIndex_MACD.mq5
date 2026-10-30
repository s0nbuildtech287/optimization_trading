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
enum StoplossOption
{
   Stoploss_ForceIndex,
   Stoploss_MACD
};
// Inputs
input double lotThreshold = 0;                             // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                            // Magic number for the EA
input double riskMoney = 100;                              // Risk Money
input bool AcceptBuy = true;                               // Enable Buy Orders
input bool AcceptSell = false;                             // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;       // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;         // Order Entry Mode
input ENUM_MA_METHOD ForceMAMethod = MODE_SMA;             // Force MA Method
input ENUM_APPLIED_VOLUME ForceVolume = VOLUME_TICK;       // Force MA Volume
input int forcePeriod = 13;                                // Force Period
input int fastEMA = 12;                                    // Fast EMA
input int slowEMA = 26;                                    // Slow EMA
input int macdSMA = 9;                                     // MACD SMA
input ENUM_APPLIED_PRICE macdPrice = PRICE_OPEN;           // MACD Price
input StoplossOption StoplossChoice = Stoploss_ForceIndex; // Stoploss Option
input int foLevel = 0;                                     // Force Index level for signals
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int forceIndex_handle;
int macd_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double force_now;
   double force_prev;
   double macd_now;
   double macd_prev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (StoplossChoice)
      {
      case Stoploss_ForceIndex:
         tradeCustom.UpdateSLUpDownValue(force_now, foLevel, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      case Stoploss_MACD:
         tradeCustom.UpdateSLUpDownValue(macd_now, 0, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      default:
         break;
      }

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (forceIndex_handle == INVALID_HANDLE || macd_handle == INVALID_HANDLE)
      {
         Print("Loi: chua tao duoc chi bao!");
         return NULL;
      }
      double force_buf[], macd_buf[];
      ArraySetAsSeries(force_buf, true);
      ArraySetAsSeries(macd_buf, true);

      // ForceIndex: buffer 0
      int c1 = CopyBuffer(forceIndex_handle, 0, shift, 2, force_buf);
      // MACD: buffer 0
      int c2 = CopyBuffer(macd_handle, 0, shift, 2, macd_buf);

      force_now = force_buf[0];
      force_prev = force_buf[1];
      macd_now = macd_buf[0];
      macd_prev = macd_buf[1];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = force_now > foLevel && force_prev < foLevel && macd_now > 0;
      signals.sell = force_now < foLevel && force_prev > foLevel && macd_now < 0;
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
   forceIndex_handle = iForce(_Symbol, SelectedTimeframe, forcePeriod, ForceMAMethod, ForceVolume);
   macd_handle = iMACD(_Symbol, SelectedTimeframe, fastEMA, slowEMA, macdSMA, macdPrice);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   switch (StoplossChoice)
   {
   case Stoploss_ForceIndex:
      tradeCustom.CalculatePreviousLowestAndHighestValue(shift, forceIndex_handle, 0, foLevel, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
      break;
   case Stoploss_MACD:
      tradeCustom.CalculatePreviousLowestAndHighestValue(shift, macd_handle, 0, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
      break;
   default:
      break;
   }

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (forceIndex_handle != INVALID_HANDLE)
      IndicatorRelease(forceIndex_handle);
   if (macd_handle != INVALID_HANDLE)
      IndicatorRelease(macd_handle);

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
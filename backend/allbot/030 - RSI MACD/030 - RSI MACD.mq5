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
input int fast_ema_period = 12;                           // Fast EMA period for MACD
input int slow_ema_period = 26;                           // Slow EMA period for MACD
input int signal_period = 9;                              // Signal period for MACD
input ENUM_APPLIED_PRICE applied_price = PRICE_CLOSE;     // Price type for MACD
input int rsi_level = 60;                                 // RSI level for buy/sell signals
input int rsi_period = 14;                                // RSI period
input ENUM_APPLIED_PRICE rsi_applied_price = PRICE_CLOSE; // Price type for RSI
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int macd_handle;
int rsi_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double macdValue;
   double macdValuePrev;
   double rsiValue;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(macdValue, 0, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {

      if (macd_handle == INVALID_HANDLE || rsi_handle == INVALID_HANDLE)
         return NULL;

      double macdValueBuf[], rsiValueBuf[];
      CopyBuffer(macd_handle, 0, shift, 2, macdValueBuf);
      CopyBuffer(rsi_handle, 0, shift, 1, rsiValueBuf);
      macdValue = macdValueBuf[1];
      macdValuePrev = macdValueBuf[0];
      rsiValue = rsiValueBuf[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (rsiValue > rsi_level && macdValue > 0 && macdValuePrev < 0);
      signals.sell = (rsiValue < rsi_level && macdValue < 0 && macdValuePrev > 0);
      signals.closeBuy = (macdValue <= 0) || (rsiValue < rsi_level);
      signals.closeSell = (macdValue >= 0) || (rsiValue > rsi_level);

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
   macd_handle = iMACD(_Symbol, SelectedTimeframe, fast_ema_period, slow_ema_period, signal_period, applied_price);
   rsi_handle = iRSI(_Symbol, SelectedTimeframe, rsi_period, rsi_applied_price);
   if (macd_handle == INVALID_HANDLE || rsi_handle == INVALID_HANDLE)
   {
      Print("Failed to create indicator handles: MACD=", macd_handle, " RSI=", rsi_handle);
      return INIT_FAILED;
   }
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighest(shift, macd_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (macd_handle != INVALID_HANDLE)
      IndicatorRelease(macd_handle);
   if (rsi_handle != INVALID_HANDLE)
      IndicatorRelease(rsi_handle);
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
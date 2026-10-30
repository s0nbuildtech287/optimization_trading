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
input int AtrLength = 10;                            // PMax ATR period
input double AtrCoeff = 3.0;                         // PMax ATR coefficient
input int MA_Period = 10;                            // PMax Moving Average period
input ENUM_MA_METHOD MA_Method = MODE_EMA;           // PMax MA type (SMA, EMA, LWMA, SMMA)
input int MACD_Fast = 12;                            // MACD fast EMA period
input int MACD_Slow = 26;                            // MACD slow EMA period
input int MACD_Signal = 9;                           // MACD signal period
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int pmax_handle, macd_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double pmax;
   double pmax_prev;
   double ma;
   double ma_prev;
   double macd_main;
   double macd_signal;
   double price_prev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      stoploss = pmax;

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double pmaxBuffer[], maBuffer[], macd_mainBuffer[], macd_signalBuffer[];
      CopyBuffer(pmax_handle, 0, shift, 2, pmaxBuffer);
      CopyBuffer(pmax_handle, 1, shift, 2, maBuffer);
      CopyBuffer(macd_handle, 0, shift, 1, macd_mainBuffer);
      CopyBuffer(macd_handle, 1, shift, 1, macd_signalBuffer);
      pmax = pmaxBuffer[1];
      pmax_prev = pmaxBuffer[0];
      ma = maBuffer[1];
      ma_prev = maBuffer[0];
      macd_main = macd_mainBuffer[0];
      macd_signal = macd_signalBuffer[0];
      price_prev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (ma > pmax &&
                     ma_prev < pmax_prev &&
                     macd_main > 0);

      signals.sell = (ma < pmax &&
                      ma_prev > pmax_prev &&
                      macd_main < 0);

      // Exit Buy: MA cuts below PMax
      signals.closeBuy = (ma <= pmax);

      // Exit Sell: MA cuts above PMax
      signals.closeSell = (ma >= pmax);

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
   pmax_handle = iCustom(_Symbol, SelectedTimeframe, "PMax", AtrLength, AtrCoeff, MA_Period, MA_Method);
   macd_handle = iMACD(_Symbol, SelectedTimeframe, MACD_Fast, MACD_Slow, MACD_Signal, PRICE_CLOSE);
   if (pmax_handle == INVALID_HANDLE || macd_handle == INVALID_HANDLE)
   {
      return (INIT_FAILED);
   }
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
   if (pmax_handle != INVALID_HANDLE)
      IndicatorRelease(pmax_handle);
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
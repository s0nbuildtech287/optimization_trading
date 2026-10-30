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
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
datetime lastBarTime = iTime(_Symbol, SelectedTimeframe, 0);
input int Atr_Period = 10;      // Fast Atr
input double Factor = 1.5;      // Fast Factor
input int Slow_Atr_Period = 40; // Slow Atr
input double SLow_Factor = 6;   // Slow Factor
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int Ma1;
int Ma2;
int HeikenAshi_aux = 0;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double ma1Prev;
   double ma2Prev;
   double ma1;
   double ma2;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (Ma1 == 0 || Ma2 == 0 || HeikenAshi_aux == 0)
      {
         Print("Error: Handle not initialized.");
         return NULL;
      }
      double ma1Buffer[];
      double ma2Buffer[];
      double sl[];
      int copied_sar = CopyBuffer(Ma1, 1, shift, 2, ma1Buffer);
      int copied_sl = CopyBuffer(Ma1, 0, shift, 1, sl);
      int copied_bulls = CopyBuffer(Ma2, 1, shift, 2, ma2Buffer);

      // Debug: Kiểm tra CopyBuffer kết quả
      if (copied_sl <= 0)
      {
         Print("Error: CopyBuffer Ma1 buffer 0 failed. Error: ", GetLastError());
         return NULL;
      }
      if (copied_sar <= 0)
      {
         Print("Error: CopyBuffer Ma1 buffer 1 failed. Error: ", GetLastError());
         return NULL;
      }
      if (copied_bulls <= 0)
      {
         Print("Error: CopyBuffer Ma2 buffer 1 failed. Error: ", GetLastError());
         return NULL;
      }

      ma1 = ma1Buffer[1];
      ma2 = ma2Buffer[1];
      ma1Prev = ma1Buffer[0];
      ma2Prev = ma2Buffer[0];
      stoploss = sl[0];
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = ma1Prev == 1.0 && ma1 == 0.0 && ma2 == 0.0 && ma2Prev == 0.0;
      signals.sell = ma1Prev == 0.0 && ma1 == 1.0 && ma2 == 1.0 && ma2Prev == 1.0;
      signals.closeBuy = ma1 == 1.0;
      signals.closeSell = ma1 == 0.0;

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
   HeikenAshi_aux = iCustom(Symbol(), PERIOD_CURRENT, "Examples/Heiken_Ashi");
   Ma1 = iCustom(_Symbol, PERIOD_CURRENT, "Supertrend_HeikenAshi", Atr_Period, Factor);
   Ma2 = iCustom(_Symbol, PERIOD_CURRENT, "Supertrend_HeikenAshi", Slow_Atr_Period, SLow_Factor);
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
   if (Ma1 != INVALID_HANDLE)
   {
      IndicatorRelease(Ma1);
   }
   if (Ma2 != INVALID_HANDLE)
   {
      IndicatorRelease(Ma2);
   }
   if (HeikenAshi_aux != INVALID_HANDLE)
   {
      IndicatorRelease(HeikenAshi_aux);
   }
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
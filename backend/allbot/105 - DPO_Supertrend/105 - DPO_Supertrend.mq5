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
input int supertrend_period = 10;
input double supertrend_mutiplier = 0.3;
input int dpo_periof = 15;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int sp_handle;
int dpo_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double spValueCurent;
   double spValuePrev;
   double spColorCurent;
   double spColorPrev;
   double dpoValueCurent;
   double dpoValuePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      stoploss = spValueCurent;
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (sp_handle == INVALID_HANDLE || dpo_handle == INVALID_HANDLE)
      {
         Print("Error getting handle for sp or dpo: ", GetLastError());
         return NULL;
      }

      double spValue[];
      double spColorBuffer[];
      double dpoBuffer[];

      int copiedSpValue = CopyBuffer(sp_handle, 0, shift, 2, spValue);
      int copiedSpColor = CopyBuffer(sp_handle, 3, shift, 2, spColorBuffer);
      int copiedDpo = CopyBuffer(dpo_handle, 0, shift, 2, dpoBuffer);

      spValueCurent = spValue[1];
      spValuePrev = spValue[0];
      spColorCurent = spColorBuffer[1];
      spColorPrev = spColorBuffer[0];
      dpoValueCurent = dpoBuffer[1];
      dpoValuePrev = dpoBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = spColorPrev == 1 && spColorCurent == 0 && dpoValueCurent > 0;
      signals.sell = spColorPrev == 0 && spColorCurent == 1 && dpoValueCurent < 0;
      signals.closeBuy = spColorCurent == 1;
      signals.closeSell = spColorCurent == 0;
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
   sp_handle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\supertrend_105", supertrend_period, supertrend_mutiplier);
   dpo_handle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Examples\\DPO", dpo_periof, PRICE_CLOSE);
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
   if (sp_handle != INVALID_HANDLE)
      IndicatorRelease(sp_handle);
   if (dpo_handle != INVALID_HANDLE)
      IndicatorRelease(dpo_handle);
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
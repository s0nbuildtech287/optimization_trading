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
input int InpEvnPeriod = 20;                         // Envelope  Period
input int shiftEvn = 0;                              // Envelope  shift
input ENUM_MA_METHOD evn_method = MODE_SMA;          // Envelope  Method
input ENUM_APPLIED_PRICE evn_Apply = PRICE_TYPICAL;  // Envelope  Apply To
input double deviation = 0.1;                        // Deviation for the envelope indicator

input ENUM_APPLIED_PRICE rsiApply = PRICE_TYPICAL; // RSI  Apply To
input int rsiPeriod = 14;                          // RSI  Period
input int rsiLevels = 50;                          // RSI   Level
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
// Indicator handles
int rsi_handle;
int envelope_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double rsi_valaue;
   double envUp_valaue;
   double envLow_valaue;
   double rsi_valauePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(rsi_valaue, rsiLevels, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (rsi_handle == INVALID_HANDLE || envelope_handle == INVALID_HANDLE)
      {
         Print("Error creating handle: ", GetLastError());
         return NULL;
      }
      double rsiBuffer[], evnUpBuffer[], evnLowBuffer[];
      CopyBuffer(rsi_handle, 0, shift, 2, rsiBuffer);
      CopyBuffer(envelope_handle, 0, shift, 1, evnUpBuffer);
      CopyBuffer(envelope_handle, 1, shift, 1, evnLowBuffer);

      rsi_valaue = rsiBuffer[1];
      envUp_valaue = evnUpBuffer[0];
      envLow_valaue = evnLowBuffer[0];
      rsi_valauePrev = rsiBuffer[0];
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = price > envUp_valaue && rsi_valauePrev < rsiLevels && rsi_valaue > rsiLevels;
      signals.sell = price < envLow_valaue && rsi_valauePrev > rsiLevels && rsi_valaue < rsiLevels;
      signals.closeBuy = rsi_valaue <= rsiLevels;
      signals.closeSell = rsi_valaue >= rsiLevels;

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
   rsi_handle = iRSI(_Symbol, SelectedTimeframe, rsiPeriod, rsiApply);
   envelope_handle = iEnvelopes(_Symbol,
                                SelectedTimeframe,
                                InpEvnPeriod,
                                shiftEvn,
                                evn_method,
                                evn_Apply,
                                deviation);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, rsi_handle, 0, rsiLevels, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (rsi_handle != INVALID_HANDLE)
      IndicatorRelease(rsi_handle);
   if (envelope_handle != INVALID_HANDLE)
      IndicatorRelease(envelope_handle);


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
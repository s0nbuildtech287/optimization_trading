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
input int MA_Period = 20;                            //  MA Period
input ENUM_MA_METHOD ma_method = MODE_SMA;           // MA Method
input ENUM_APPLIED_PRICE SMA_Apply = PRICE_TYPICAL;  // MA Apply To
input int CCI_Period = 14;                           // CCI Period
input ENUM_APPLIED_PRICE CCI_Apply = PRICE_TYPICAL;  // CCI Apply To
input int cci_level = 0;                             // CCI Level
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int cci_handle;
int ma_hanld;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double ma_value;
   double cci_value;
   double maPrev_value;
   double cciPrev_value;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(price, ma_value, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {

      double ma_buffer[];
      double cci_buffer[];
      if (CopyBuffer(ma_hanld, 0, shift, 2, ma_buffer) <= 0)
      {
         Print("Error copying MA buffer");
         return NULL;
      }
      if (CopyBuffer(cci_handle, 0, shift, 2, cci_buffer) <= 0)
      {
         Print("Error copying CCI buffer");
         return NULL;
      }
      ma_value = ma_buffer[1];
      cci_value = cci_buffer[1];
      maPrev_value = ma_buffer[0];
      cciPrev_value = cci_buffer[0];
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = price > ma_value && cci_value > cci_level && cciPrev_value < cci_level;
      signals.sell = price < ma_value && cci_value < cci_level && cciPrev_value > cci_level;
      signals.closeBuy = cci_value <= cci_level;
      signals.closeSell = cci_value >= cci_level;

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
   cci_handle = iCCI(_Symbol, SelectedTimeframe, CCI_Period, CCI_Apply);
   ma_hanld = iMA(_Symbol, SelectedTimeframe, MA_Period, 0, ma_method, SMA_Apply);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, ma_hanld, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (cci_handle != INVALID_HANDLE)
      IndicatorRelease(cci_handle);
   if (ma_hanld != INVALID_HANDLE)
      IndicatorRelease(ma_hanld);

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
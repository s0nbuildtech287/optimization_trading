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
input int ADX_Period = 14;                           // ADX Period
input int adxLevel = 20;                             // ADX level for trend confirmation

input int RSI_Period = 2;                           // RSI Period
input ENUM_APPLIED_PRICE RSI_Apply = PRICE_TYPICAL; // RSI Apply To
input int RSI_BuyLevel = 30;                        // RSI Buy level
input int RSI_SellLevel = 70;                       // RSI Sell level

input ENUM_MA_METHOD ma_method = MODE_SMA; // MA Method
input int MA_Period = 20;                  //  MA Period
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int MA_handle;
int ADX_handle;
int RSI_handle;

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
   double ma_valuePrev;
   double adx_value;
   double rsi_value;
   double closePrev;

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
      double ADX_Buffer[];
      double RSI_Buffer[];
      double MA_Buffer[];

      CopyBuffer(ADX_handle, 0, shift, 1, ADX_Buffer);
      CopyBuffer(RSI_handle, 0, shift, 1, RSI_Buffer);
      CopyBuffer(MA_handle, 0, shift, 2, MA_Buffer);
      adx_value = ADX_Buffer[0];
      rsi_value = RSI_Buffer[0];
      ma_value = MA_Buffer[1];
      ma_valuePrev = MA_Buffer[0];
      closePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = price > ma_value && closePrev < ma_valuePrev && rsi_value > RSI_BuyLevel && adx_value > adxLevel;
      signals.sell = price < ma_value && closePrev > ma_valuePrev && rsi_value < RSI_SellLevel && adx_value > adxLevel;
      signals.closeBuy = price < ma_value || rsi_value <= RSI_BuyLevel;
      signals.closeSell = price > ma_value || rsi_value >= RSI_SellLevel;

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
   MA_handle = iMA(_Symbol, SelectedTimeframe, MA_Period, 0, ma_method, MODE_SMA);
   ADX_handle = iADX(_Symbol, SelectedTimeframe, ADX_Period);
   RSI_handle = iRSI(_Symbol, SelectedTimeframe, RSI_Period, RSI_Apply);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();
   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, MA_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (MA_handle != INVALID_HANDLE)
      IndicatorRelease(MA_handle);
   if (ADX_handle != INVALID_HANDLE)
      IndicatorRelease(ADX_handle);
   if (RSI_handle != INVALID_HANDLE)
      IndicatorRelease(RSI_handle);

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
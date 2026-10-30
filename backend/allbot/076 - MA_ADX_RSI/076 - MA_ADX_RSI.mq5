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
enum SL_OPTIONS
{
   SL_SLB, // Number of bars for Stoploss
   SL_MA,  // Moving Average as Stoploss
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int MA_Period = 50;                            // MA period
input ENUM_MA_METHOD MA_Method = MODE_EMA;           // MA type (SMA, EMA, LWMA, SMMA)
input int ADX_Period = 14;                           // ADX period
input double ADX_Threshold = 25.0;                   // ADX threshold
input int RSI_Period = 14;                           // RSI period
input double RSI_Threshold = 50.0;                   // RSI threshold
input SL_OPTIONS StoplossOption = SL_SLB;            // Stoploss option
input int StoplossBars = 12;                         // Number of bars for Stoploss

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ma_handle, adx_handle, rsi_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double ma;
   double ma_prev;
   double adx_main;
   double rsi;
   double close_prev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (StoplossOption)
      {
      case SL_SLB:
      {
         if (signals.buy && AcceptBuy)
            stoploss = tradeCustom.CalculateDynamicStoploss(true, StoplossBars, shift, SelectedTimeframe);
         else if (signals.sell && AcceptSell)
            stoploss = tradeCustom.CalculateDynamicStoploss(false, StoplossBars, shift, SelectedTimeframe);
      }
      break;
      case SL_MA:
      {
         tradeCustom.UpdateSLUpDownValue(price, ma, currentLow, currentHigh, stoploss, highestPriceDuringGreen, lowestPriceDuringRed);
      }
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
      double maBuffer[], adx_mainBuffer[], rsiBuffer[];

      if (CopyBuffer(ma_handle, 0, shift, 2, maBuffer) <= 1 ||
          CopyBuffer(adx_handle, 0, shift, 1, adx_mainBuffer) <= 0 ||
          CopyBuffer(rsi_handle, 0, shift, 1, rsiBuffer) <= 0)
      {
         return NULL;
      }

      ma = maBuffer[1];
      ma_prev = maBuffer[0];
      adx_main = adx_mainBuffer[0];
      rsi = rsiBuffer[0];
      close_prev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (price > ma &&
                     close_prev < ma_prev &&
                     adx_main > ADX_Threshold &&
                     rsi > RSI_Threshold);
      signals.sell = (price < ma &&
                      close_prev > ma_prev &&
                      adx_main > ADX_Threshold &&
                      rsi < RSI_Threshold);
      signals.closeBuy = rsi < RSI_Threshold || price <= ma;
      signals.closeSell = (rsi > RSI_Threshold || price >= ma);

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
   ma_handle = iMA(_Symbol, SelectedTimeframe, MA_Period, 0, MA_Method, PRICE_CLOSE);
   adx_handle = iADX(_Symbol, SelectedTimeframe, ADX_Period);
   rsi_handle = iRSI(_Symbol, SelectedTimeframe, RSI_Period, PRICE_CLOSE);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   if (StoplossOption == SL_MA)
   {
      tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, ma_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
   }
   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (ma_handle != INVALID_HANDLE)
      IndicatorRelease(ma_handle);
   if (adx_handle != INVALID_HANDLE)
      IndicatorRelease(adx_handle);
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
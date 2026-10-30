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
input int CE_Period = 22;                            // CE period (ATR & Extremums)
input double CE_Multiplier = 3.0;                    // CE ATR multiplier
input bool CE_UseClose = true;                       // CE Use Close Price for Extremums
input SL_OPTIONS StoplossOption = SL_SLB;            // Stoploss option
input int StoplossBars = 12;                         // Number of bars for Stoploss
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ma_handle, adx_handle, ce_handle;

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
   double ce_long;  // Chandelier Long Stop
   double ce_short; // Chandelier Short Stop
   int ce_dir;      // Chandelier Direction (1: Up, -1: Down)
   double close_prev;
   double adx_prev;
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
         {
            stoploss = tradeCustom.CalculateDynamicStoploss(true, StoplossBars, shift, SelectedTimeframe);
         }
         else if (signals.sell && AcceptSell)
         {
            stoploss = tradeCustom.CalculateDynamicStoploss(false, StoplossBars, shift, SelectedTimeframe);
         }
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
      double maBuffer[], adx_mainBuffer[], ce_longBuffer[], ce_shortBuffer[], ce_up_arrowBuffer[], ce_down_arrowBuffer[];
      CopyBuffer(ma_handle, 0, shift, 2, maBuffer);
      CopyBuffer(adx_handle, 0, shift, 2, adx_mainBuffer);
      CopyBuffer(ce_handle, 0, shift, 1, ce_longBuffer);
      CopyBuffer(ce_handle, 1, shift, 1, ce_shortBuffer);
      CopyBuffer(ce_handle, 2, shift, 1, ce_up_arrowBuffer);
      CopyBuffer(ce_handle, 3, shift, 1, ce_down_arrowBuffer);

      ma = maBuffer[1];
      ma_prev = maBuffer[0];
      adx_main = adx_mainBuffer[1];
      ce_long = ce_longBuffer[0];
      ce_short = ce_shortBuffer[0];
      close_prev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      adx_prev = adx_mainBuffer[0];
      ce_dir = (ce_longBuffer[0] != EMPTY_VALUE) ? 1 : (ce_shortBuffer[0] != EMPTY_VALUE) ? -1
                                                                                          : 0;

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (price > ma &&
                     close_prev < ma_prev &&
                     adx_main > ADX_Threshold &&
                     ce_dir == 1);
      signals.sell = (price < ma &&
                      close_prev > ma_prev &&
                      adx_main > ADX_Threshold &&
                      ce_dir == -1);
      signals.closeBuy = (price <= ma) || ce_dir == -1;
      signals.closeSell = (price >= ma) || ce_dir == 1;

      return signals;
   }
   void CalculatePriceExtremesBasedOnCeDir(int shift)
   {
      int barsToCheck = 100;

      for (int i = barsToCheck; i > 0; i--)
      {
         int s = i + shift;
         double currentLow = iLow(_Symbol, SelectedTimeframe, s);
         double currentHigh = iHigh(_Symbol, SelectedTimeframe, s);
         double ce_long_buffer[], ce_short_buffer[];
         if (CopyBuffer(ce_handle, 0, s, 1, ce_long_buffer) <= 0 ||
             CopyBuffer(ce_handle, 1, s, 1, ce_short_buffer) <= 0)
         {
            Print("Failed to copy CE buffers at shift: ", s);
            continue;
         }
         ce_dir = (ce_long_buffer[0] != EMPTY_VALUE) ? 1 : (ce_short_buffer[0] != EMPTY_VALUE) ? -1
                                                                                               : 0;
         if (ce_dir < 0) // Downtrend - track lowest
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (ce_dir > 0) // Uptrend - track highest
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
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
   ce_handle = iCustom(_Symbol, SelectedTimeframe, "ChandelierExit", CE_Period, CE_Multiplier, CE_UseClose);
   if (ma_handle == INVALID_HANDLE || adx_handle == INVALID_HANDLE || ce_handle == INVALID_HANDLE)
   {
      return (INIT_FAILED);
   }
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   g_handleValues.CalculatePriceExtremesBasedOnCeDir(shift);

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
   if (ce_handle != INVALID_HANDLE)
      IndicatorRelease(ce_handle);

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
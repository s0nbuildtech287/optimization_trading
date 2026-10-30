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
enum StopLossBuyOptionEnum
{
   SL_ON_MIDDLE, // StopLoss Middle line donchian channel
   SL_ON_LOWER   // StopLoss Lower band donchian channel
};

enum StopLossSellOptionEnum
{
   SL_SELL_ON_MIDDLE, // StopLoss Middle line donchian channel
   SL_SELL_ON_UPPER,  // StopLoss Upper band donchian channel
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int InpDonchianPeriod = 20;                    // Donchian Period

input ENUM_MA_METHOD ma_method = MODE_SMA;          // MA Method
input int MA_Period = 200;                          //  MA Period
input ENUM_APPLIED_PRICE SMA_Apply = PRICE_TYPICAL; // MA Apply To

input StopLossBuyOptionEnum StopLossBuyOption = SL_ON_MIDDLE;        // Buy StopLoss Option
input StopLossSellOptionEnum StopLossSellOption = SL_SELL_ON_MIDDLE; // Sell StopLoss Option
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int donchian_handle;
int ma_handle;

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
   double donchian_mid_value;
   double donchian_mid_valuePrev;
   double donchian_upper_value;
   double donchian_lower_value;
   double pricePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (signals.buy && AcceptBuy)
      {
         switch (StopLossBuyOption)
         {
         case SL_ON_MIDDLE:
            stoploss = donchian_mid_value;
            break;
         case SL_ON_LOWER:
            stoploss = donchian_lower_value;
            break;
         }
      }
      else if (signals.sell && AcceptSell)
      {
         switch (StopLossSellOption)
         {
         case SL_SELL_ON_MIDDLE:
            stoploss = donchian_mid_value;
            break;
         case SL_SELL_ON_UPPER:
            stoploss = donchian_upper_value;
            break;
         }
      }

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double ma_buffer[];
      double donchian_buffer[];
      double donchian_mid_buffer[];
      double donchian_upper_buffer[];
      double donchian_lower_buffer[];
      CopyBuffer(ma_handle, 0, shift, 1, ma_buffer);
      CopyBuffer(donchian_handle, 1, shift, 2, donchian_mid_buffer);
      CopyBuffer(donchian_handle, 0, shift, 1, donchian_upper_buffer);
      CopyBuffer(donchian_handle, 2, shift, 1, donchian_lower_buffer);
      ma_value = ma_buffer[0];
      donchian_mid_value = donchian_mid_buffer[1];
      donchian_mid_valuePrev = donchian_mid_buffer[0];
      donchian_upper_value = donchian_upper_buffer[0];
      donchian_lower_value = donchian_lower_buffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = (price > donchian_mid_value) && (pricePrev < donchian_mid_valuePrev) && (price > ma_value);
      signals.sell = (price < donchian_mid_value) && (pricePrev > donchian_mid_valuePrev) && (price < ma_value);
      signals.closeBuy = (price <= donchian_mid_value);
      signals.closeSell = (price >= donchian_mid_value);

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
   donchian_handle = iCustom(_Symbol, SelectedTimeframe, "Donchian Channel", InpDonchianPeriod, false);
   ma_handle = iMA(_Symbol, SelectedTimeframe, MA_Period, 0, ma_method, SMA_Apply);
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
   if (donchian_handle != INVALID_HANDLE)
      IndicatorRelease(donchian_handle);
   if (ma_handle != INVALID_HANDLE)
      IndicatorRelease(ma_handle);

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
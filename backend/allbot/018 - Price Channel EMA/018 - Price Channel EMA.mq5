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
input int ChannelPeriod = 22;                        // Price Channel period
input int EMAPeriod = 20;                            // EMA period
input double ChannelMultiplier = 1.0;                // Multiplier for channel width
input ENUM_MA_METHOD Method = MODE_SMA;              // MA Method: Simple/Exponential/Smoothed/Linear
input ENUM_APPLIED_PRICE ApplyTo = PRICE_CLOSE;      // Apply to: Close/Open/High/Low/Median/Typical/Weighted
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int channelHandle = INVALID_HANDLE;
int emaHandle = INVALID_HANDLE;
// Indicator handles

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double channelUpper;
   double channelLower;
   double channelMiddle;
   double channelMiddlePrev;
   double pricePrev;

   double ema;
   double price;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (signals.buy && AcceptBuy)
         stoploss = channelLower;
      else if (signals.sell && AcceptSell)
         stoploss = channelUpper;

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double channelUpper_Buffer[], channelLower_Buffer[], channelMiddle_Buffer[], ema_Buffer[];
      if (channelHandle != INVALID_HANDLE)
      {
         CopyBuffer(channelHandle, 0, shift, 1, channelUpper_Buffer);
         CopyBuffer(channelHandle, 1, shift, 1, channelLower_Buffer);
         CopyBuffer(channelHandle, 2, shift, 2, channelMiddle_Buffer);
      }
      CopyBuffer(emaHandle, 0, shift, 1, ema_Buffer);

      channelUpper = channelUpper_Buffer[0];
      channelLower = channelLower_Buffer[0];
      channelMiddle = channelMiddle_Buffer[1];
      channelMiddlePrev = channelMiddle_Buffer[0];
      ema = ema_Buffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (price > ema &&
                     price > channelMiddle &&
                     pricePrev < channelMiddlePrev);
      signals.sell = (price < ema &&
                      price < channelMiddle &&
                      pricePrev > channelMiddlePrev);

      signals.closeBuy = (price <= channelMiddle);
      signals.closeSell = (price >= channelMiddle);

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
   channelHandle = iCustom(_Symbol, SelectedTimeframe, "Price_Channel",
                           ChannelPeriod,    // Tham số 1: Period
                           ChannelMultiplier // Tham số 2: Multiplier
   );
   emaHandle = iMA(_Symbol, SelectedTimeframe, EMAPeriod, 0, Method, ApplyTo);
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
   if (channelHandle != INVALID_HANDLE)
      IndicatorRelease(channelHandle);
   if (emaHandle != INVALID_HANDLE)
      IndicatorRelease(emaHandle);

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
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
enum StopLossBuyOption
{
   SL_BUY_MID,
   SL_BUY_LOW
};

enum StopLossSellOption
{
   SL_SELL_MID,
   SL_SELL_UP
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int AvgPeriod = 20;                            // Volume weighted average period
input ENUM_APPLIED_PRICE Price = PRICE_CLOSE;        // Price type for VWAP calculation

input int InpDonchianPeriod = 20;                          // Donchian Period
input StopLossBuyOption stopLossOptionBuy = SL_BUY_MID;    // Buy Stoploss Option
input StopLossSellOption stopLossOptionSell = SL_SELL_MID; // Sell Stoploss Option
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int donchian_handle;
int wwap_hand;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double donchianUpper_value;
   double donchianLower_value;
   double donchianMid_value;
   double donchianMid_valuePrev;
   double vwap_value;
   double pricePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (AcceptBuy && signals.buy)
      {
         switch (stopLossOptionBuy)
         {
         case SL_BUY_MID:
            stoploss = donchianMid_value;
            break;
         case SL_BUY_LOW:
            stoploss = donchianLower_value;
            break;
         }
      }
      if (AcceptSell && signals.sell)
      {
         switch (stopLossOptionSell)
         {
         case SL_SELL_MID:
            stoploss = donchianMid_value;
            break;
         case SL_SELL_UP:
            stoploss = donchianUpper_value;
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
      if (donchian_handle == INVALID_HANDLE || wwap_hand == INVALID_HANDLE)
      {
         Print("Error creating handle: ", GetLastError());
         return NULL;
      }
      double donchian_upper[];
      double donchian_lower[];
      double donchian_mid[];
      double vwap_buffer[];
      CopyBuffer(donchian_handle, 0, shift, 1, donchian_upper);
      CopyBuffer(donchian_handle, 2, shift, 1, donchian_lower);
      CopyBuffer(donchian_handle, 1, shift, 2, donchian_mid);
      CopyBuffer(wwap_hand, 3, shift, 1, vwap_buffer);
      donchianUpper_value = donchian_upper[0];
      donchianLower_value = donchian_lower[0];
      donchianMid_value = donchian_mid[1];
      donchianMid_valuePrev = donchian_mid[0];
      vwap_value = vwap_buffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = (price > donchianMid_value) && (pricePrev < donchianMid_valuePrev) && (price > vwap_value);
      signals.sell = (price < donchianMid_value) && (pricePrev > donchianMid_valuePrev) && (price < vwap_value);
      signals.closeBuy = (price <= donchianMid_value);
      signals.closeSell = (price >= donchianMid_value);
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
   wwap_hand = iCustom(_Symbol, SelectedTimeframe, "VWAP_Bands",
                       AvgPeriod);
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
   if (wwap_hand != INVALID_HANDLE)
      IndicatorRelease(wwap_hand);

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
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
   SL_BUY_LOWER, // StopLoss Lower band donchian channel
   SL_BUY_MID,   // StopLoss Middle band  donchian channel
};

enum StopLossSellOptionEnum
{
   SL_SELL_ON_MIDDLE, // StopLoss Middle line donchian channel
   SL_SELL_ON_UPPER,  // StopLoss Upper band donchian channel
};
// Inputs
input double lotThreshold = 0;                                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                                      // Magic number for the EA
input double riskMoney = 100;                                        // Risk Money
input bool AcceptBuy = true;                                         // Enable Buy Orders
input bool AcceptSell = false;                                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;                 // Selected SelectedTimeframe for the EA
input ENUM_TIMEFRAMES SelectedTimeframeHtf = PERIOD_D1;              // Selected SelectedTimeframe for HTF
input ENUM_TIMEFRAMES SelectedTimeframeLtf = PERIOD_H1;              // Selected SelectedTimeframe for LTF
input OrderEntryMode OrderEntryOption = ENTRY_ATO;                   // Order Entry Mode
input int InpDonchianPeriodHTF = 20;                                 // Donchian HTF Period
input int InpDonchianPeriodLTF = 20;                                 // Donchian LTF Period
input StopLossBuyOptionEnum stopLossOptionBuy = SL_BUY_MID;          // Buy Stoploss Option
input StopLossSellOptionEnum stopLossOptionSell = SL_SELL_ON_MIDDLE; // Sell Stoploss Option

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int donchian_handle_htf;
int donchian_handle_ltf;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double donchianUpper_value_htf;
   double donchianLower_value_htf;
   double donchianMid_value_htf;
   double donchianUpper_value_ltf;
   double donchianLower_value_ltf;
   double donchianMid_value_ltf;
   double donchianMid_value_ltfPrev;
   double pricePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      // Check for existing positions - prevent opening new orders if any position is open

      if (signals.buy && AcceptBuy)
      {
         switch (stopLossOptionBuy)
         {
         case SL_BUY_MID:
            stoploss = donchianMid_value_ltf;
            break;
         case SL_BUY_LOWER:
            stoploss = donchianLower_value_ltf;
            break;
         }
      }
      else if (signals.sell && AcceptSell)
      {
         switch (stopLossOptionSell)
         {
         case SL_SELL_ON_MIDDLE:
            stoploss = donchianMid_value_ltf;
            break;
         case SL_SELL_ON_UPPER:
            stoploss = donchianUpper_value_ltf;
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
      double donchianUpperHTF[];
      double donchianMidHTF[];
      double donchianLowHTF[];
      double donchianLowerLTF[];
      double donchianMidLTF[];
      double donchianUpperLTF[];
      CopyBuffer(donchian_handle_htf, 1, shift, 1, donchianMidHTF);
      CopyBuffer(donchian_handle_htf, 0, shift, 1, donchianUpperHTF);
      CopyBuffer(donchian_handle_htf, 2, shift, 1, donchianLowHTF);
      CopyBuffer(donchian_handle_ltf, 2, shift, 2, donchianLowerLTF);
      CopyBuffer(donchian_handle_ltf, 1, shift, 2, donchianMidLTF);
      CopyBuffer(donchian_handle_ltf, 0, shift, 1, donchianUpperLTF);

      donchianUpper_value_htf = donchianUpperHTF[0];
      donchianMid_value_htf = donchianMidHTF[0];
      donchianLower_value_htf = donchianLowHTF[0];
      donchianUpper_value_ltf = donchianUpperLTF[0];
      donchianMid_value_ltf = donchianMidLTF[1];
      donchianLower_value_ltf = donchianLowerLTF[1];
      donchianMid_value_ltfPrev = donchianMidLTF[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = price > donchianMid_value_ltf && pricePrev < donchianMid_value_ltfPrev && price > donchianMid_value_htf;
      signals.sell = price < donchianMid_value_ltf && pricePrev > donchianMid_value_ltfPrev && price < donchianMid_value_htf;
      signals.closeBuy = price <= donchianMid_value_ltf ;
      signals.closeSell = price >= donchianMid_value_ltf;

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
   donchian_handle_htf = iCustom(_Symbol, SelectedTimeframeHtf, "Donchian Channel", InpDonchianPeriodHTF, false);
   donchian_handle_ltf = iCustom(_Symbol, SelectedTimeframeLtf, "Donchian Channel", InpDonchianPeriodLTF, false);

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
   if (donchian_handle_htf != INVALID_HANDLE)
      IndicatorRelease(donchian_handle_htf);
   if (donchian_handle_ltf != INVALID_HANDLE)
      IndicatorRelease(donchian_handle_ltf);

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
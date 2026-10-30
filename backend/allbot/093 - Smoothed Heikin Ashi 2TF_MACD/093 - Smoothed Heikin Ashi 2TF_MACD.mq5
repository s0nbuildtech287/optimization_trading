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
enum ChoseSL
{
   SL_SHA, // Stoploss based on Smoothed Heikin Ashi
   SL_MACD // Stoploss based on MACD
};
// Inputs
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input ENUM_TIMEFRAMES SelectedTimeframeHtf = PERIOD_D1; // Selected SelectedTimeframe for HTF
input ENUM_TIMEFRAMES SelectedTimeframeLtf = PERIOD_H1; // Selected SelectedTimeframe for LTF
input ENUM_MA_METHOD inpMaMetod_HTF = MODE_SMA;         // SHA HTF Smoothing Method
input int inpMaPeriod_HTF = 7;                          // SHA HTF Smoothing Period
input int inpStep_HTF = 0;                              // SHA HTF Step size
input ENUM_MA_METHOD inpMaMetod_LTF = MODE_SMA;         // SHA LTF Smoothing Method
input int inpMaPeriod_LTF = 7;                          // SHA LTF Smoothing Period
input int inpStep_LTF = 0;                              // SHA LTF Step size
input int fast_ema_period_Lft = 6;                      // MACD LTF Fast EMA Period
input int slow_ema_period_Lft = 18;                     // MACD LTF Slow EMA Period
input int signal_period_Lft = 4;                        // MACD LTF Signal Period
input ChoseSL ChoseStoploss = SL_SHA;                   // Choose Stoploss Method
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int macd_handle_Ltf;
int sha_handle_Htf;
int sha_handle_Ltf;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double sha_Htf;
   double sha_Ltf;
   double sha_LtfPrev;
   double macd_Ltf;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (ChoseStoploss)
      {
      case SL_SHA:
         tradeCustom.UpdateSLUpDownValue(1.5, sha_Ltf, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      case SL_MACD:
         tradeCustom.UpdateSLUpDownValue(macd_Ltf, 0, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
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
      if (macd_handle_Ltf == INVALID_HANDLE || sha_handle_Htf == INVALID_HANDLE || sha_handle_Ltf == INVALID_HANDLE)
      {
         Print("Invalid handle for MACD or SHA indicator.");
         return NULL;
      }
      double macd_LtfBuffer[];
      double sha_HtfBuffer[];
      double sha_LtfBuffer[];
      int copied_Ltf = CopyBuffer(macd_handle_Ltf, 0, shift, 1, macd_LtfBuffer);
      int copied_sha_Htf = CopyBuffer(sha_handle_Htf, 4, shift, 1, sha_HtfBuffer);
      int copied_sha_Ltf = CopyBuffer(sha_handle_Ltf, 4, shift, 2, sha_LtfBuffer);

      sha_Htf = sha_HtfBuffer[0];
      sha_Ltf = sha_LtfBuffer[1];
      sha_LtfPrev = sha_LtfBuffer[0];
      macd_Ltf = macd_LtfBuffer[0];
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (sha_Htf == 1.0 && sha_Ltf == 1.0 && macd_Ltf > 0 && sha_LtfPrev == 2.0);
      signals.sell = (sha_Htf == 2.0 && sha_Ltf == 2.0 && macd_Ltf < 0 && sha_LtfPrev == 1.0);
      signals.closeBuy = (macd_Ltf < 0 || sha_Ltf == 2.0);
      signals.closeSell = (macd_Ltf > 0 || sha_Ltf == 1.0);

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
   macd_handle_Ltf = iMACD(_Symbol, SelectedTimeframeLtf, fast_ema_period_Lft, slow_ema_period_Lft, signal_period_Lft, PRICE_CLOSE);
   sha_handle_Htf = iCustom(_Symbol, SelectedTimeframeHtf, "Heiken_Ashi_Smoothed", inpMaPeriod_HTF, inpMaMetod_HTF, inpStep_HTF, false);
   sha_handle_Ltf = iCustom(_Symbol, SelectedTimeframeLtf, "Heiken_Ashi_Smoothed", inpMaPeriod_LTF, inpMaMetod_LTF, inpStep_LTF, false);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   switch (ChoseStoploss)
   {
   case SL_SHA:
      tradeCustom.CalculatePreviousLowestAndHighestValue(shift, sha_handle_Ltf, 4, 1.5, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframeLtf);
      break;
   case SL_MACD:
      tradeCustom.CalculatePreviousLowestAndHighestValue(shift, macd_handle_Ltf, 0, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframeLtf);
      break;
   default:
      break;
   }

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (macd_handle_Ltf != INVALID_HANDLE)
      IndicatorRelease(macd_handle_Ltf);
   if (sha_handle_Htf != INVALID_HANDLE)
      IndicatorRelease(sha_handle_Htf);
   if (sha_handle_Ltf != INVALID_HANDLE)
      IndicatorRelease(sha_handle_Ltf);
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
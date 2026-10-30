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
input int KO_FastPeriod = 34;                        // Klinger Oscillator Fast period
input int KO_SlowPeriod = 55;                        // Klinger Oscillator Slow period
input int KO_SignalPeriod = 13;                      // Klinger Oscillator Signal period
input SL_OPTIONS StoplossOption = SL_SLB;            // Stoploss option
input int StoplossBars = 50;                         // Number of bars for Stoploss
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ma_handle, ko_handle;
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
   double klinger;
   double signal;
   double klinger_prev;
   double signal_prev;
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
      double maBuffer[], klingerBuffer[], signalBuffer[];
      if (CopyBuffer(ma_handle, 0, shift, 2, maBuffer) <= 1 ||
          CopyBuffer(ko_handle, 1, shift, 2, klingerBuffer) <= 1 ||
          CopyBuffer(ko_handle, 0, shift, 2, signalBuffer) <= 1)
      {
         return NULL;
      }
      ma = maBuffer[0];
      ma_prev = maBuffer[1];
      klinger = klingerBuffer[0];
      signal = signalBuffer[0];
      klinger_prev = klingerBuffer[1];
      signal_prev = signalBuffer[1];
      close_prev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      // Buy signal: Klinger crosses above Signal and Close is above MA
      signals.buy = (klinger > signal &&
                     klinger_prev <= signal_prev &&
                     price > ma);

      // Sell signal: Klinger crosses below Signal and Close is below MA
      signals.sell = (klinger < signal &&
                      klinger_prev >= signal_prev &&
                      price < ma);

      // Exit buy: Klinger crosses below Signal
      
      signals.closeBuy = (klinger < signal &&
                          klinger_prev >= signal_prev);

      // Exit sell: Klinger crosses above Signal
      
      signals.closeSell = (klinger > signal &&
                           klinger_prev <= signal_prev);

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
   ko_handle = iCustom(_Symbol, SelectedTimeframe, "KlingerOS", KO_FastPeriod, KO_SlowPeriod, KO_SignalPeriod, MA_Method, PRICE_CLOSE);
   if (ma_handle == INVALID_HANDLE || ko_handle == INVALID_HANDLE)
   {
      return (INIT_FAILED);
   }
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, ma_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (ma_handle != INVALID_HANDLE)
      IndicatorRelease(ma_handle);
   if (ko_handle != INVALID_HANDLE)
      IndicatorRelease(ko_handle);

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
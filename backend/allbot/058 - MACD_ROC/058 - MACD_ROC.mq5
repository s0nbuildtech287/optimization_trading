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
input double lotThreshold = 0;                            // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                           // Magic number for the EA
input double riskMoney = 100;                             // Risk Money
input bool AcceptBuy = true;                              // Enable Buy Orders
input bool AcceptSell = false;                            // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;      // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;        // Order Entry Mode
input int fast_ema_period = 12;                           // Fast EMA period for MACD
input int slow_ema_period = 26;                           // Slow EMA period for MACD
input int signal_period = 9;                              // Signal period for MACD
input ENUM_APPLIED_PRICE applied_price = PRICE_CLOSE;     // Price type for MACD
input int roc_period = 14;                                // ROC period
input ENUM_APPLIED_PRICE rsi_applied_price = PRICE_CLOSE; // Price type for ROC
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int macd_handle;
int roc_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double macdValue;
   double macdValuePrev;
   double rocvalue;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(macdValue, 0, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (macd_handle == INVALID_HANDLE || roc_handle == INVALID_HANDLE)
      {
         Print("Error: Invalid indicator handle. MACD: ", macd_handle, ", ROC: ", roc_handle);
         return NULL;
      }
      double macdBuffer[];
      double rocBuffer[];

      int copiedMACD = CopyBuffer(macd_handle, 0, shift, 2, macdBuffer);
      int copiedROC = CopyBuffer(roc_handle, 0, shift, 2, rocBuffer);
      if (copiedMACD <= 0)
      {
         Print("Error copying MACD buffer: ", GetLastError());
         return NULL;
      }
      if (copiedROC <= 0)
      {
         Print("Error copying ROC buffer: ", GetLastError(), " (Indicator path may be wrong)");
         return NULL;
      }
      macdValue = macdBuffer[1];
      macdValuePrev = macdBuffer[0];
      rocvalue = rocBuffer[1];
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = (rocvalue > 0 && macdValue > 0 && macdValuePrev < 0);
      signals.sell = (rocvalue < 0 && macdValue < 0 && macdValuePrev > 0);
      signals.closeBuy = (macdValue <= 0);
      signals.closeSell = (macdValue >= 0);
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

   macd_handle = iMACD(_Symbol, SelectedTimeframe, fast_ema_period, slow_ema_period, signal_period, applied_price);
   roc_handle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Examples\\ROC", roc_period, rsi_applied_price);

   if (macd_handle == INVALID_HANDLE)
   {
      Print("Error: Cannot create MACD indicator. Error: ", GetLastError());
      return INIT_FAILED;
   }
   if (roc_handle == INVALID_HANDLE)
   {
      Print("Error: Cannot create ROC indicator. Check if 'ROC' indicator exists. Error: ", GetLastError());
      return INIT_FAILED;
   }

   Sleep(500);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, macd_handle, 0, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{

   if (macd_handle != INVALID_HANDLE)
      IndicatorRelease(macd_handle);
   if (roc_handle != INVALID_HANDLE)
      IndicatorRelease(roc_handle);

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
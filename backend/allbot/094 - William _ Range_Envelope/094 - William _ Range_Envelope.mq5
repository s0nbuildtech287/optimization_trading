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
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input int envelopes_Period = 14;                        // Period for the Envelopes indicator
input double envelopes_Deviation = 0.1;                 // Deviation for the Envelopes indicator
input int envelopes_Shift = 0;                          // Shift for the Envelopes indicator
input ENUM_MA_METHOD envelopes_Method = MODE_SMA;       // Method for the Envelopes indicato
input ENUM_APPLIED_PRICE envelopes_Price = PRICE_CLOSE; // Price type for the Envelopes indicator
input int williams_Period = 14;                         // Period for the Williams indicator
input int williamsLevel = -80;                          // Williams level for the Williams indicator
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int williams_handle;
int envelops_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double williamsCurrent;
   double williamsPrevious;
   double envelopesUpperCurrent;
   double envelopesLowerCurrent;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(williamsCurrent, williamsLevel, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (williams_handle == INVALID_HANDLE || envelops_handle == INVALID_HANDLE)
         return NULL;

      double willBuffer[];
      double envelopesUpperBuffer[], envelopesLowerBuffer[];
      int copiedWilliams = CopyBuffer(williams_handle, 0, shift, 2, willBuffer);
      int copied2 = CopyBuffer(envelops_handle, 0, shift, 1, envelopesUpperBuffer);
      int copied3 = CopyBuffer(envelops_handle, 1, shift, 1, envelopesLowerBuffer);
      williamsCurrent = willBuffer[1];
      williamsPrevious = willBuffer[0];
      envelopesUpperCurrent = envelopesUpperBuffer[0];
      envelopesLowerCurrent = envelopesLowerBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = williamsCurrent > williamsLevel && williamsPrevious < williamsLevel && envelopesUpperCurrent < price;
      signals.sell = williamsCurrent < williamsLevel && williamsPrevious > williamsLevel && envelopesLowerCurrent > price;
      signals.closeBuy = williamsCurrent <= williamsLevel;
      signals.closeSell = williamsCurrent >= williamsLevel;

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
   williams_handle = iWPR(_Symbol, SelectedTimeframe, williams_Period);
   envelops_handle = iEnvelopes(_Symbol, SelectedTimeframe, envelopes_Period, envelopes_Shift, envelopes_Method, envelopes_Price, envelopes_Deviation);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, williams_handle, 0, williamsLevel, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (williams_handle != INVALID_HANDLE)
      IndicatorRelease(williams_handle);
   if (envelops_handle != INVALID_HANDLE)
      IndicatorRelease(envelops_handle);

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
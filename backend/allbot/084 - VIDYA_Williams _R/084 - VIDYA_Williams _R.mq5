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
   SL_AT_VIDYA, // SL at Vidya(0)
   SL_AT_DYN,   // SL at DYN(1)
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int vidya_Period = 9;                          // VIDYA EMA Period
input int cmo_Period = 14;                           // VIDYA CMO Period
ENUM_APPLIED_PRICE cmo_Price = PRICE_CLOSE;          // VIDYA CMO Price type
int shiftVidya = 0;                                  // VIDYA Shift
input int williams_Period = 14;                      // Williams Period
input int Level = 20;                                // Williams  level
input ChoseSL ChoiceSl = SL_AT_VIDYA;                // Choose SL method
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int williams_handle;
int vidya_handle;

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
   double vidyaPrevious;
   double vidyaCurrent;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (ChoiceSl)
      {
      case SL_AT_VIDYA:
         stoploss = vidyaCurrent;
         break;
      case SL_AT_DYN:
         tradeCustom.UpdateSLUpDownValue(price, vidyaCurrent, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      }
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (williams_handle == INVALID_HANDLE || vidya_handle == INVALID_HANDLE)
         return NULL;

      double willBuffer[];
      double vidyaBuffer[];
      int copiedWilliams = CopyBuffer(williams_handle, 0, shift, 2, willBuffer);
      int copiedVidya = CopyBuffer(vidya_handle, 0, shift, 2, vidyaBuffer);
      williamsCurrent = willBuffer[1];
      vidyaCurrent = vidyaBuffer[1];
      williamsPrevious = willBuffer[0];
      vidyaPrevious = vidyaBuffer[0];
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = williamsCurrent > Level && williamsPrevious < Level && vidyaCurrent < price;
      signals.sell = williamsCurrent < Level && williamsPrevious > Level && vidyaCurrent > price;
      signals.closeBuy = williamsCurrent <= Level ;
      signals.closeSell = williamsCurrent >= Level ;

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
   vidya_handle = iVIDyA(_Symbol, SelectedTimeframe, cmo_Period, vidya_Period, shiftVidya, cmo_Price);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, vidya_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (williams_handle != INVALID_HANDLE)
      IndicatorRelease(williams_handle);
   if (vidya_handle != INVALID_HANDLE)
      IndicatorRelease(vidya_handle);

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
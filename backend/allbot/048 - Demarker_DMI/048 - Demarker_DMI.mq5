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
input int DeMarkerPeriod = 14;                       // DeMarker indicator period
input int DMIPeriod = 14;                            // DMI (ADX) indicator period
input double DeMarkerUpLevel = 0.3;                  // DeMarker level for uptrend
input double DeMarkerDownLevel = 0.7;                // DeMarker level for downtrend
// Runtime globals
double stoploss = 0.0;
double lowestSinceLastCross = 0.0;
double highestSinceLastCross = 0.0;

// Indicator handles
int deMarkerHandle;
int dmiHandle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double deMarker;
   double plusDI;
   double minusDI;
   double adx;
   double plusDIPrev;
   double minusDIPrev;
   double pricePrev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(plusDI, minusDI, currentLow, currentHigh, stoploss, lowestSinceLastCross, highestSinceLastCross);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double deMarkerBuffer[], plusDIBuffer[], minusDIBuffer[], adxBuffer[];

      if (deMarkerHandle != INVALID_HANDLE)
         CopyBuffer(deMarkerHandle, 0, shift, 1, deMarkerBuffer);
      if (dmiHandle != INVALID_HANDLE)
      {
         CopyBuffer(dmiHandle, 1, shift, 2, plusDIBuffer);
         CopyBuffer(dmiHandle, 2, shift, 2, minusDIBuffer);
         CopyBuffer(dmiHandle, 0, shift, 1, adxBuffer);
      }

      deMarker = deMarkerBuffer[0];
      plusDI = plusDIBuffer[1];
      minusDI = minusDIBuffer[1];
      plusDIPrev = plusDIBuffer[0];
      minusDIPrev = minusDIBuffer[0];
      adx = adxBuffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = deMarker > DeMarkerUpLevel && plusDI > minusDI && plusDIPrev < minusDIPrev;
      signals.sell = deMarker < DeMarkerDownLevel && minusDI > plusDI && minusDIPrev < plusDIPrev;
      signals.closeBuy = minusDI >= plusDI;
      signals.closeSell = plusDI >= minusDI;

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
   deMarkerHandle = iDeMarker(_Symbol, SelectedTimeframe, DeMarkerPeriod);
   dmiHandle = iADX(_Symbol, SelectedTimeframe, DMIPeriod);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000); // Đảm bảo indicator đã sẵn sàng

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (deMarkerHandle != INVALID_HANDLE)
      IndicatorRelease(deMarkerHandle);
   if (dmiHandle != INVALID_HANDLE)
      IndicatorRelease(dmiHandle);

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
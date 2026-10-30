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
input int adxPeriod = 14;                            // ADX Period
input int adxEntry = 25;                             // ADX Entry (0-100)
input int adxExit = 20;                              // ADX Exit (0-100)
input int rsiPeriod = 14;                            // RSI Period
ENUM_APPLIED_PRICE rsiPrice = PRICE_CLOSE;           // RSI Price type
input int rsiLevel = 50;                             // RSI Level for entry/exit
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
bool isInitialized = false; // Flag để theo dõi đã khởi tạo chưa

// Indicator handles
int adx_handle; // Handle for ADX indicator
int rsi_handle; // Handle for RSI indicat

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double adxCurrent;     // Current ADX value
   double adxPrev;        // Previous ADX value
   double plusDICurrent;  // Current +DI value
   double plusDIPrev;     // Previous +DI value
   double minusDICurrent; // Current -DI value
   double minusDIPrev;    // Previous -DI value
   double rsiCurrent;     // Current RSI value
   double rsiPrev;        // Previous RSI value

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(plusDICurrent, minusDICurrent, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (adx_handle == INVALID_HANDLE || rsi_handle == INVALID_HANDLE)
      {
         Print("Error getting handle for ADX or RSI: ", GetLastError());
         return NULL;
      }

      double adxBuffer[];
      double plusDIBuffer[];
      double minusDIBuffer[];
      double rsiBuffer[];

      // Copy ADX, +DI, -DI (buffers 0, 1, 2 respectively)
      int copiedADX = CopyBuffer(adx_handle, 0, shift, 2, adxBuffer);
      int copiedPlusDI = CopyBuffer(adx_handle, 1, shift, 2, plusDIBuffer);
      int copiedMinusDI = CopyBuffer(adx_handle, 2, shift, 2, minusDIBuffer);
      int copiedRSI = CopyBuffer(rsi_handle, 0, shift, 2, rsiBuffer);

      if (copiedADX <= 0 || copiedPlusDI <= 0 || copiedMinusDI <= 0 || copiedRSI <= 0)
      {
         Print("Error copying indicator buffers: ", GetLastError());
         return NULL;
      }

      // Assign values to instance
      adxCurrent = adxBuffer[1];
      adxPrev = adxBuffer[0];
      plusDICurrent = plusDIBuffer[1];
      plusDIPrev = plusDIBuffer[0];
      minusDICurrent = minusDIBuffer[1];
      minusDIPrev = minusDIBuffer[0];
      rsiCurrent = rsiBuffer[1];
      rsiPrev = rsiBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      // Buy conditions: ADX > 25, +DI crosses above -DI, RSI > 50
      signals.buy = adxCurrent > adxEntry &&
                    plusDICurrent > minusDICurrent &&
                    plusDIPrev < minusDIPrev &&
                    rsiCurrent > rsiLevel;

      // Sell conditions: ADX > 25, -DI crosses above +DI, RSI < 50
      signals.sell = adxCurrent > adxEntry &&
                     minusDICurrent > plusDICurrent &&
                     minusDIPrev < plusDIPrev &&
                     rsiCurrent < rsiLevel;

      // Close Buy conditions: ADX < 20 or +DI < -DI or RSI < 50
      signals.closeBuy = adxCurrent < adxExit ||
                         plusDICurrent <= minusDICurrent ||
                         rsiCurrent < rsiLevel;

      // Close Sell conditions: ADX > 20 or -DI < +DI or RSI > 50
      signals.closeSell = adxCurrent < adxExit ||
                          minusDICurrent <= plusDICurrent ||
                          rsiCurrent > rsiLevel;

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
   adx_handle = iADX(_Symbol, SelectedTimeframe, adxPeriod);
   rsi_handle = iRSI(_Symbol, SelectedTimeframe, rsiPeriod, rsiPrice);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000); // Wait a moment to ensure indicators are ready
   tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, adx_handle, 1, adx_handle, 2, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (adx_handle != INVALID_HANDLE)
      IndicatorRelease(adx_handle);
   if (rsi_handle != INVALID_HANDLE)
      IndicatorRelease(rsi_handle);
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
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
input int cciPeriod = 14;                            // Period for CCI
input double nrtrPeriod = 14;                        // Period for NRTR
input double nrtrK = 2.0;                            // K multiplier for NRTR
input bool InpShowLabel = true;                      // show price of level
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int cci_handle;
int nrtr_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double cciCurrent;
   double shortSupportCurrent;
   double shortSupportPrev;
   double longSupportCurrent;
   double longSupportPrev;
   double pricePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (AcceptBuy == true && signals.buy)
         stoploss = longSupportCurrent; // For long: SL at NRTR Support
      if (AcceptSell == true && signals.sell)
         stoploss = shortSupportCurrent; // For short: SL at NRTR Resistance
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (cci_handle == INVALID_HANDLE || nrtr_handle == INVALID_HANDLE)
      {
         Print("Error getting handle for CCI or NRTR: ", GetLastError());
         return NULL;
      }

      double cciBuffer[];
      double nrtrLongBuffer[];
      double nrtrShortBuffer[];
      int copiedCCI = CopyBuffer(cci_handle, 0, shift, 2, cciBuffer);
      int copiedLong = CopyBuffer(nrtr_handle, 1, shift, 2, nrtrLongBuffer);
      int copiedShort = CopyBuffer(nrtr_handle, 2, shift, 2, nrtrShortBuffer);
      if (copiedCCI <= 0 || copiedLong <= 0 || copiedShort <= 0)
      {
         Print("Error copying buffer data: ", GetLastError());
         return NULL;
      }
      // Assign values to instance
      cciCurrent = (cciBuffer[1] == EMPTY_VALUE) ? 0 : cciBuffer[1];
      longSupportCurrent = (nrtrLongBuffer[1] == EMPTY_VALUE) ? 0 : nrtrLongBuffer[1];
      longSupportPrev = (nrtrLongBuffer[0] == EMPTY_VALUE) ? 0 : nrtrLongBuffer[0];
      shortSupportCurrent = (nrtrShortBuffer[1] == EMPTY_VALUE) ? 0 : nrtrShortBuffer[1];
      shortSupportPrev = (nrtrShortBuffer[0] == EMPTY_VALUE) ? 0 : nrtrShortBuffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = cciCurrent > 0 && longSupportCurrent < price && 0 == longSupportPrev;
      signals.sell = cciCurrent < 0 && shortSupportCurrent > price && 0 == shortSupportPrev;
      signals.closeBuy = shortSupportCurrent > 0;
      signals.closeSell = longSupportCurrent > 0;

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
   cci_handle = iCCI(_Symbol, SelectedTimeframe, cciPeriod, PRICE_TYPICAL);
   nrtr_handle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Free Indicators\\NRTR Channel", nrtrPeriod, nrtrK, InpShowLabel);
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
   if (cci_handle != INVALID_HANDLE)
      IndicatorRelease(cci_handle);
   if (nrtr_handle != INVALID_HANDLE)
      IndicatorRelease(nrtr_handle);
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
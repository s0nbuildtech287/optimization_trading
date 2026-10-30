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
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int ForcePeriod = 13;                          // Period for Force Index
input ENUM_MA_METHOD ForceMethod = MODE_EMA;         // Calculation method for Force Index
input int StochasticKPeriod = 14;                    // %K period for Stochastic
input int StochasticDPeriod = 3;                     // %D period for Stochastic
input int StochasticSlowing = 3;                     // Slowing value for Stochastic
input ENUM_MA_METHOD StochasticMethod = MODE_SMA;    // Calculation method for Stochastic
enum STOPLOSS_MODE
{
   STOPLOSS_FORCE,     // Stop Loss based on Force Index
   STOPLOSS_STOCHASTIC // Stop Loss based on Stochastic
};

input STOPLOSS_MODE StoplossMode = STOPLOSS_FORCE; // Stop Loss mode
// Runtime globals
double stoploss = 0.0;                        // Stop Loss value
double lowestPriceDuringNegativeForce = 0.0;  // Lowest price during negative Force Index or Stochastic
double highestPriceDuringPositiveForce = 0.0; // Highest price during positive Force Index or Stochastic
int lastRVICrossIndex = -1;
double lowestSinceLastCross = DBL_MAX;
double highestSinceLastCross = 0.0;
// Indicator handles
int force_handle;      // Handle for Force Index
int stochastic_handle; // Handle for Stochastic

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double forceCurrent;  // Giá trị Force Index hiện tại
   double forcePrev;     // Giá trị Force Index trước đó
   double stochKCurrent; // Giá trị %K hiện tại của Stochastic
   double stochKPrev;    // Giá trị %K trước đó
   double stochDCurrent; // Giá trị %D hiện tại của Stochastic
   double stochDPrev;    // Giá trị %D trước đó

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      if (StoplossMode == STOPLOSS_FORCE)
      {
         tradeCustom.UpdateSLUpDownValue(forceCurrent, 0, currentLow, currentHigh,
                                         stoploss, lowestPriceDuringNegativeForce, highestPriceDuringPositiveForce);
      }
      else
      {
         tradeCustom.UpdateSLUpDownValue(stochKCurrent, stochDCurrent, currentLow, currentHigh,
                                         stoploss, lowestSinceLastCross, highestSinceLastCross);
      }

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold,
                             MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (force_handle == INVALID_HANDLE || stochastic_handle == INVALID_HANDLE)
      {
         Print("Lỗi khi lấy handle cho Force Index hoặc Stochastic: ", GetLastError());
         return NULL;
      }

      double forceBuffer[];
      double stochKBuffer[];
      double stochDBuffer[];
      int copiedForce = CopyBuffer(force_handle, 0, shift, 2, forceBuffer);
      int copiedStoch = CopyBuffer(stochastic_handle, 0, shift, 2, stochKBuffer);
      int copiedStochD = CopyBuffer(stochastic_handle, 1, shift, 2, stochDBuffer);

      if (copiedForce <= 0 || copiedStoch <= 0 || copiedStochD <= 0)
      {
         Print("Lỗi khi sao chép dữ liệu buffer: ", GetLastError());
         return NULL;
      }

      forceCurrent = forceBuffer[1];
      forcePrev = forceBuffer[0];
      stochKCurrent = stochKBuffer[1];
      stochKPrev = stochKBuffer[0];
      stochDCurrent = stochDBuffer[1];
      stochDPrev = stochDBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = forceCurrent > 0 &&
                    stochKCurrent > stochDCurrent &&
                    stochKPrev < stochDPrev;
      signals.sell = forceCurrent < 0 &&
                     stochKCurrent < stochDCurrent &&
                     stochKPrev > stochDPrev;

      signals.closeBuy = stochKCurrent <= stochDCurrent;
      signals.closeSell = stochKCurrent >= stochDCurrent;

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
   force_handle = iForce(_Symbol, SelectedTimeframe, ForcePeriod, ForceMethod, VOLUME_TICK);
   stochastic_handle = iStochastic(_Symbol, SelectedTimeframe, StochasticKPeriod, StochasticDPeriod, StochasticSlowing, StochasticMethod, STO_LOWHIGH);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   if (StoplossMode == STOPLOSS_FORCE)
   {
      tradeCustom.CalculatePreviousLowestAndHighest(shift, force_handle, 0, lowestPriceDuringNegativeForce, highestPriceDuringPositiveForce, SelectedTimeframe);
   }
   else
   {
      tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, stochastic_handle, 0, stochastic_handle, 1, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);
   }

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (force_handle != INVALID_HANDLE)
      IndicatorRelease(force_handle);
   if (stochastic_handle != INVALID_HANDLE)
      IndicatorRelease(stochastic_handle);

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
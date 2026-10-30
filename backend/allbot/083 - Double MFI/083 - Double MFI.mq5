//+------------------------------------------------------------------+
//|                        Copyright 2025, LotusQuant                  |
//|                        https://LotusQuant.com                      |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2025, LotusQuant"
#property link "https://LotusQuant.com"
#property version "1.00"
#include <Trade/LotusQuantLibrary.mqh>
CTradeCustomEx tradeCustom;

// Inputs
input double lotThreshold = 0;                                // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                               // Magic number for the EA
input double riskMoney = 100;                                 // Risk Money
input bool AcceptBuy = true;                                  // Enable Buy Orders
input bool AcceptSell = false;                                // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;          // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;            // Order Entry Mode
input int mfiFastPeriod = 10;                                 // Fast period for MFI
input ENUM_APPLIED_VOLUME mfiFastAppliedVolume = VOLUME_TICK; // Applied volume for MFI fast
input int mfiSlowPeriod = 20;                                 // Slow period for MFI
input ENUM_APPLIED_VOLUME mfiSlowAppliedVolume = VOLUME_TICK; // Applied volume for MFI slow
input double mfiFastThreshold = 80;                           // Threshold for fast MFI
input double mfiSlowThreshold = 20;                           // Threshold for slow MFI
input int stoplossLookback = 50;                              // Number of candles to look back for stoploss

// Global runtime variables and indicator handles
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int mfiSlow_handle;
int mfiFast_handle;

// Class definition
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double mfiFastCurrent;
   double mfiSlowCurrent;
   double mfiFastPrev;

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;
      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      if (signals.buy && AcceptBuy)
         stoploss = tradeCustom.CalculateDynamicStoploss(true, stoplossLookback, shift, SelectedTimeframe);
      else if (signals.sell && AcceptSell)
         stoploss = tradeCustom.CalculateDynamicStoploss(false, stoplossLookback, shift, SelectedTimeframe);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (mfiFast_handle == 0 || mfiSlow_handle == 0)
      {
         Print("MFI handles are not initialized.");
         return NULL;
      }

      double mfiFastBuffer[];
      double mfiSlowBuffer[];

      if (CopyBuffer(mfiFast_handle, 0, shift, 2, mfiFastBuffer) <= 0 ||
          CopyBuffer(mfiSlow_handle, 0, shift, 1, mfiSlowBuffer) <= 0)
      {
         Print("Failed to copy MFI buffers.");
         return NULL;
      }

      // Maintain original indexing logic
      mfiFastCurrent = mfiFastBuffer[1];
      mfiSlowCurrent = mfiSlowBuffer[0];
      mfiFastPrev = mfiFastBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = mfiFastCurrent > mfiFastThreshold && mfiSlowCurrent > mfiSlowThreshold && mfiFastPrev < mfiFastThreshold;
      signals.sell = mfiFastCurrent < mfiFastThreshold && mfiSlowCurrent < mfiSlowThreshold && mfiFastPrev > mfiFastThreshold;
      signals.closeBuy = mfiFastCurrent <= mfiFastThreshold;
      signals.closeSell = mfiFastCurrent >= mfiFastThreshold;
      return signals;
   }
};

// Global pointer instance for EA
HandleValues *g_handleValues = NULL;

// Lifecycle functions
int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber); // Gán Magic Number cho EA

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   mfiFast_handle = iMFI(_Symbol, SelectedTimeframe, mfiFastPeriod, mfiFastAppliedVolume);
   mfiSlow_handle = iMFI(_Symbol, SelectedTimeframe, mfiSlowPeriod, mfiSlowAppliedVolume);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (mfiFast_handle != INVALID_HANDLE)
      IndicatorRelease(mfiFast_handle);
   if (mfiSlow_handle != INVALID_HANDLE)
      IndicatorRelease(mfiSlow_handle);

   if (g_handleValues != NULL)
   {
      delete g_handleValues;
      g_handleValues = NULL;
   }
}

void OnTick()
{
   tradeCustom.OnTick(StaticSignalHandler, OrderEntryOption, SelectedTimeframe);
}

void StaticSignalHandler(double price, double currentLow, double currentHigh, int shift)
{
   if (g_handleValues != NULL)
      g_handleValues.ProcessTickCommon(price, currentLow, currentHigh, shift);
}
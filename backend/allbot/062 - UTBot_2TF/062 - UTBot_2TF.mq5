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
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected SelectedTimeframe for the EA
input ENUM_TIMEFRAMES SelectedTimeframeHTF = PERIOD_H4; // Selected SelectedTimeframe for the HTF
input ENUM_TIMEFRAMES SelectedTimeframeLTF = PERIOD_H1; // Selected SelectedTimeframe for the LTF
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input int momentumPeriodHTF = 14;                       // Period for the Momentum indicator HTF
input int smoothPeriodHTF = 3;                          // Smoothing period for the Momentum indicator HTF
input ENUM_APPLIED_PRICE priceHTF = PRICE_CLOSE;        // Price type for the Momentum indicator HTF
input int momentumPeriodLTF = 14;                       // Period for the Momentum indicator LTF
input int smoothPeriodLTF = 3;                          // Smoothing period for the Momentum indicator LTF
input ENUM_APPLIED_PRICE priceLTF = PRICE_CLOSE;        // Price type for the Momentum indicator LTF
int historyBars = 100;
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int uthandle_ltf;
int uthandle_htf;
enum MARKET_PHASE
{
   PHASE_UNKNOWN = 0,
   PHASE_BULLISH = 1,
   PHASE_BEARISH = 2,
   PHASE_MIXED = 3
};
MARKET_PHASE currentHTFPhase = PHASE_UNKNOWN;
MARKET_PHASE currentLTFPhase = PHASE_UNKNOWN;
MARKET_PHASE combinedMarketPhase = PHASE_UNKNOWN;
bool firstRun = true;

class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   static HandleValues *instance;
   HandleValues() { instance = NULL; }

   // Giá trị của các chỉ báo
   double bullHTF;
   double bearHTF;
   double bullLTF;
   double bearLTF;
   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;
      UpdateMarketPhases();
      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      UpdateTopAndBottom(currentLow, currentHigh);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }
   void UpdateTopAndBottom(double currentLow, double currentHigh)
   {
      if (currentLTFPhase == PHASE_BEARISH)
      {
         if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
            lowestPriceDuringRed = currentLow;
         if (highestPriceDuringGreen != 0.0)
         {
            stoploss = MathMax(highestPriceDuringGreen, currentHigh);
            highestPriceDuringGreen = 0.0;
         }
      }
      else if (currentLTFPhase == PHASE_BULLISH)
      {
         if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
            highestPriceDuringGreen = currentHigh;
         if (lowestPriceDuringRed != 0.0)
         {
            stoploss = MathMin(lowestPriceDuringRed, currentLow);
            lowestPriceDuringRed = 0.0;
         }
      }
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (uthandle_htf == INVALID_HANDLE || uthandle_ltf == INVALID_HANDLE)
      {
         Print("Error getting handle for HTF or LTF: ", GetLastError());
         return instance;
      }
      double bullHTFBuffer[];
      double bearHTFBuffer[];
      double bullLTFBuffer[];
      double bearLTFBuffer[];
      int copiedBullHTF = CopyBuffer(uthandle_htf, 0, shift, 1, bullHTFBuffer);
      int copiedBearHTF = CopyBuffer(uthandle_htf, 1, shift, 1, bearHTFBuffer);
      int copiedBullLTF = CopyBuffer(uthandle_ltf, 0, shift, 1, bullLTFBuffer);
      int copiedBearLTF = CopyBuffer(uthandle_ltf, 1, shift, 1, bearLTFBuffer);
      if (copiedBullHTF <= 0 || copiedBearHTF <= 0 || copiedBullLTF <= 0 || copiedBearLTF <= 0)
      {
         Print("Error copying buffer: ", GetLastError());
         return instance;
      }
      instance.bullHTF = bullHTFBuffer[0];
      instance.bearHTF = bearHTFBuffer[0];
      instance.bullLTF = bullLTFBuffer[0];
      instance.bearLTF = bearLTFBuffer[0];

      return instance;
   }
   void UpdateMarketPhases()
   {
      if (instance.bullHTF > 0)
      {
         currentHTFPhase = PHASE_BULLISH;
      }
      else if (instance.bearHTF > 0)
      {
         currentHTFPhase = PHASE_BEARISH;
      }
      else
      {
         // Keep previous phase if no clear signal
         if (firstRun)
            currentHTFPhase = PHASE_UNKNOWN;
      }

      if (instance.bullLTF > 0)
      {
         currentLTFPhase = PHASE_BULLISH;
      }
      else if (instance.bearLTF > 0)
      {
         currentLTFPhase = PHASE_BEARISH;
      }
      else
      {
         if (firstRun)
            currentLTFPhase = PHASE_UNKNOWN;
      }

      if (currentHTFPhase == PHASE_BULLISH && currentLTFPhase == PHASE_BULLISH)
      {
         combinedMarketPhase = PHASE_BULLISH;
      }
      else if (currentHTFPhase == PHASE_BEARISH && currentLTFPhase == PHASE_BEARISH)
      {
         combinedMarketPhase = PHASE_BEARISH;
      }
      else
      {
         combinedMarketPhase = PHASE_MIXED;
      }

      firstRun = false;
   }

   void ProcessHistoricalData(int shift = 0)
   {

      // Reset states for historical processing
      firstRun = true;
      currentHTFPhase = PHASE_UNKNOWN;
      currentLTFPhase = PHASE_UNKNOWN;
      combinedMarketPhase = PHASE_UNKNOWN;

      for (int i = historyBars; i > 0; i--)
      {
         int s = i + shift;

         // Get indicator values for HTF and LTF
         double bullHTFBuffer[];
         double bearHTFBuffer[];
         double bullLTFBuffer[];
         double bearLTFBuffer[];

         // Copy HTF buffers
         bool htfOk = (CopyBuffer(uthandle_htf, 0, s, 1, bullHTFBuffer) > 0 &&
                       CopyBuffer(uthandle_htf, 1, s, 1, bearHTFBuffer) > 0);

         // Copy LTF buffers
         bool ltfOk = (CopyBuffer(uthandle_ltf, 0, s, 1, bullLTFBuffer) > 0 &&
                       CopyBuffer(uthandle_ltf, 1, s, 1, bearLTFBuffer) > 0);

         if (!htfOk || !ltfOk)
         {
            continue;
         }

         // Update instance with the historical values
         instance.bullHTF = bullHTFBuffer[0];
         instance.bearHTF = bearHTFBuffer[0];
         instance.bullLTF = bullLTFBuffer[0];
         instance.bearLTF = bearLTFBuffer[0];

         UpdateMarketPhases();
      }

      // Force a final assignment to make sure we have some phase even if all indicators were 0
      if (currentLTFPhase == PHASE_UNKNOWN)
      {
         currentLTFPhase = currentHTFPhase;
      }
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = currentHTFPhase == PHASE_BULLISH && instance.bullLTF > 0;
      signals.sell = currentHTFPhase == PHASE_BEARISH && instance.bearLTF > 0;
      signals.closeBuy = currentLTFPhase == PHASE_BEARISH;
      signals.closeSell = currentLTFPhase == PHASE_BULLISH;
      return signals;
   }
   void CalculatePreviousLowestAndHighest(int shift)
   {
      int barsToCheck = 100;
      for (int i = barsToCheck; i > 0; i--)
      {
         HandleValuesBase *handleValues = GetIndicatorValues(i);
         double price = iClose(_Symbol, SelectedTimeframe, i + shift);
         double currentLow = iLow(_Symbol, SelectedTimeframe, i + shift);
         double currentHigh = iHigh(_Symbol, SelectedTimeframe, i + shift);
         if (currentLTFPhase == PHASE_BEARISH)
         {
            if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
               lowestPriceDuringRed = currentLow;
            if (highestPriceDuringGreen != 0.0)
               highestPriceDuringGreen = 0.0;
         }
         else if (currentLTFPhase == PHASE_BULLISH)
         {
            if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
               highestPriceDuringGreen = currentHigh;
            if (lowestPriceDuringRed != 0.0)
               lowestPriceDuringRed = 0.0;
         }
      }
   }
};
HandleValues *HandleValues::instance = NULL;

// Wait for indicators to calculate and be ready with verification
bool WaitForIndicatorsInitialization()
{
   int max_attempts = 50; // Maximum number of attempts to check
   int attempts = 0;

   while (attempts < max_attempts)
   {
      double bull_htf_buffer[];
      double bear_htf_buffer[];
      double bull_ltf_buffer[];
      double bear_ltf_buffer[];

      // Check if indicators are ready
      bool htf_ready = (CopyBuffer(uthandle_htf, 0, 0, 1, bull_htf_buffer) > 0 &&
                        CopyBuffer(uthandle_htf, 1, 0, 1, bear_htf_buffer) > 0);

      bool ltf_ready = (CopyBuffer(uthandle_ltf, 0, 0, 1, bull_ltf_buffer) > 0 &&
                        CopyBuffer(uthandle_ltf, 1, 0, 1, bear_ltf_buffer) > 0);

      if (htf_ready && ltf_ready)
      {
         return true;
      }

      attempts++;
      Sleep(500); // Wait 500ms before checking again
   }
   return false;
}

int OnInit()
{
   trade.SetExpertMagicNumber(MagicNumber);

   // Initialize indicator handles
   uthandle_htf = iCustom(_Symbol, SelectedTimeframeHTF, "UTBot", momentumPeriodHTF, smoothPeriodHTF, priceHTF);
   uthandle_ltf = iCustom(_Symbol, SelectedTimeframeLTF, "UTBot", momentumPeriodLTF, smoothPeriodLTF, priceLTF);

   if (uthandle_htf == INVALID_HANDLE || uthandle_ltf == INVALID_HANDLE)
   {
      Print("Failed to create indicator handles: ", GetLastError());
      return INIT_FAILED;
   }

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   if (HandleValues::instance == NULL)
      HandleValues::instance = new HandleValues();
   HandleValues::instance.ProcessHistoricalData(shift);
   HandleValues::instance.CalculatePreviousLowestAndHighest(shift);
   // Process historical data to initialize market phases

   return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (uthandle_ltf != INVALID_HANDLE)
   {
      IndicatorRelease(uthandle_ltf);
   }
   if (uthandle_htf != INVALID_HANDLE)
   {
      IndicatorRelease(uthandle_htf);
   }
   if (HandleValues::instance != NULL)
   {
      delete HandleValues::instance;
      HandleValues::instance = NULL;
   }
}

void OnTick()
{
   tradeCustom.OnTick(StaticSignalHandler, OrderEntryOption, SelectedTimeframe);
}

void StaticSignalHandler(double price, double currentLow, double currentHigh, int shift)
{
   if (HandleValues::instance != NULL)
      HandleValues::instance.ProcessTickCommon(price, currentLow, currentHigh, shift);
}
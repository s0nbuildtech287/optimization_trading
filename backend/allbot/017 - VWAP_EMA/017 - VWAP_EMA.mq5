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
enum BandOptionsSell
{
   BAND_1_HIGH = 1,
   BAND_2_HIGH = 2,
   BAND_3_HIGH = 3,

};
enum BandOptionsBuy
{
   BAND_1_LOW = 5,
   BAND_2_LOW = 6,
   BAND_3_LOW = 7,
};
enum CloseBandOptionsBuy
{
   CLOSE_BAND_1 = 1,
   CLOSE_BAND_2 = 2,
   CLOSE_BAND_3 = 3,
};
enum CloseBandOptionsSell
{
   CLOSE_BAND_5 = 5,
   CLOSE_BAND_6 = 6,
   CLOSE_BAND_7 = 7,
};
enum enPrices
{
   pr_close = PRICE_CLOSE,
   pr_open = PRICE_OPEN,
   pr_high = PRICE_HIGH,
   pr_low = PRICE_LOW,
   pr_median = PRICE_MEDIAN,
   pr_typical = PRICE_TYPICAL,
   pr_weighted = PRICE_WEIGHTED
};
// Inputs
input double lotThreshold = 0;                                  // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                                 // Magic number for the EA
input double riskMoney = 100;                                   // Risk Money
input bool AcceptBuy = true;                                    // Enable Buy Orders
input bool AcceptSell = false;                                  // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;            // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;              // Order Entry Mode
input BandOptionsBuy bandOptionsBuy = BAND_1_LOW;               // Band option for Buy
input BandOptionsSell bandOptionsSell = BAND_1_HIGH;            // Band option for Sell
input CloseBandOptionsBuy closeBandOptionsBuy = CLOSE_BAND_1;   // Band option for Close Buy (band1, band2, band3)
input CloseBandOptionsSell closeBandOptionsSell = CLOSE_BAND_5; // Band option for Close Sell (band5, band6, band7)
input int AvgPeriod = 20;                                       // Volume weighted average period
input bool UseRealVolume = false;                               // Use real volume?
input bool DeviationSample = false;                             // Deviation with sample correction?
input double DeviationMuliplier1 = 1;                           // First band(s) deviation
input double DeviationMuliplier2 = 2;                           // Second band(s) deviation
input double DeviationMuliplier3 = 2.5;                         // Third band(s) deviation
input int OBV_MA_Period = 5;                                    //  MA Period
input ENUM_MA_METHOD ma_method = MODE_SMA;
input ENUM_APPLIED_PRICE SMA_Apply = PRICE_TYPICAL; // SMA Apply To
input enPrices Price = pr_close;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int wwap_hand;
int MA_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double middleVWAP;
   double prevMiddleVWAP;
   double smaValue;
   double band7;
   double band6;
   double band5;
   double band3;
   double band2;
   double band1;
   double closePrice;
   double prevClosePrice;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      // Set stoploss based on band options
      if (signals.buy && AcceptBuy)
      {
         // For BUY: use Lower Bands as stoploss
         switch (bandOptionsBuy)
         {
         case BAND_1_LOW:
            stoploss = band5; // Lower Band 1
            break;
         case BAND_2_LOW:
            stoploss = band6; // Lower Band 2
            break;
         case BAND_3_LOW:
            stoploss = band7; // Lower Band 3
            break;
         }
      }
      if (signals.sell && AcceptSell)
      {
         // For SELL: use Upper Bands as stoploss
         switch (bandOptionsSell)
         {
         case BAND_1_HIGH:
            stoploss = band3; // Upper Band 1
            break;
         case BAND_2_HIGH:
            stoploss = band2; // Upper Band 2
            break;
         case BAND_3_HIGH:
            stoploss = band1; // Upper Band 3
            break;
         }
      }

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double Band1[], Band2[], Band3[],
          Band4[], Band5[],
          Band6[], Band7[], SMA[];
      CopyBuffer(wwap_hand, 0, shift, 1, Band1);
      CopyBuffer(wwap_hand, 1, shift, 1, Band2);
      CopyBuffer(wwap_hand, 2, shift, 1, Band3);
      CopyBuffer(wwap_hand, 3, shift, 2, Band4);
      CopyBuffer(wwap_hand, 4, shift, 1, Band5);
      CopyBuffer(wwap_hand, 5, shift, 1, Band6);
      CopyBuffer(wwap_hand, 6, shift, 1, Band7);
      CopyBuffer(MA_handle, 0, shift, 1, SMA);

      middleVWAP = Band4[1];
      prevMiddleVWAP = Band4[0];
      smaValue = SMA[0];
      band1 = Band1[0];
      band2 = Band2[0];
      band3 = Band3[0];
      band5 = Band5[0];
      band6 = Band6[0];
      band7 = Band7[0];
      closePrice = iClose(_Symbol, SelectedTimeframe, shift);
      prevClosePrice = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = closePrice > smaValue && prevClosePrice < prevMiddleVWAP && closePrice > middleVWAP;
      signals.sell = closePrice < smaValue && prevClosePrice > prevMiddleVWAP && closePrice < middleVWAP;

      switch (closeBandOptionsBuy)
      {
      case CLOSE_BAND_1:
         signals.closeBuy = (closePrice > band1);
         break;
      case CLOSE_BAND_2:
         signals.closeBuy = (closePrice > band2);
         break;
      case CLOSE_BAND_3:
         signals.closeBuy = (closePrice > band3);
         break;
      }

      switch (closeBandOptionsSell)
      {
      case CLOSE_BAND_5:
         signals.closeSell = (closePrice < band5);
         break;
      case CLOSE_BAND_6:
         signals.closeSell = (closePrice < band6);
         break;
      case CLOSE_BAND_7:
         signals.closeSell = (closePrice < band7);
         break;
      }

      // Add middleVWAP check
      signals.closeBuy = signals.closeBuy || (closePrice <= middleVWAP);
      signals.closeSell = signals.closeSell || (closePrice >= middleVWAP);

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
   wwap_hand = iCustom(Symbol(), SelectedTimeframe, "VWAP_Bands",
                       AvgPeriod,
                       Price,
                       UseRealVolume,
                       DeviationSample,
                       DeviationMuliplier1,
                       DeviationMuliplier2,
                       DeviationMuliplier3);
   MA_handle = iMA(_Symbol, SelectedTimeframe, OBV_MA_Period, 0, ma_method, SMA_Apply);
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
   if (wwap_hand != INVALID_HANDLE)
      IndicatorRelease(wwap_hand);
   if (MA_handle != INVALID_HANDLE)
      IndicatorRelease(MA_handle);

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
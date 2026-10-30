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
enum StopLossSource
{
   SL_SOURCE_SPAN_A, // Senkou Span A
   SL_SOURCE_SPAN_B  // Senkou Span B
};
// Inputs
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input StopLossSource StoplossChoice = SL_SOURCE_SPAN_A; // Chọn stoploss mode
input ENUM_MA_METHOD MA_Mode = MODE_SMMA;
input ENUM_APPLIED_PRICE PriceType = PRICE_MEDIAN; // Applied Price
//--- Input Parameters Ichimoku
input int tenkan_sen = 9;     // Tenkansen
input int kijun_sen = 26;     // Kijunsen
input int senkou_span_b = 52; // SenkouSpanB
//--- Input Parameters MACD
input int fast_ema_period = 12; // Fast EMA period
input int slow_ema_period = 26; // Slow EMA period
input int signal_period = 9;    // Signal SMA period

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int macdHandle;
int ichimokuHandle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double macdMain_value;
   double macdSignal_value;
   double macdMainPrev_value;
   double macdSignalPrev_value;
   double senkouSpanA_value;
   double senkouSpanB_value;
   double senkouSpanA_valuePrev;
   double senkouSpanB_valuePrev;

   double kijunSen_value;
   double tenkanSen_value;
   double priceClose_valuePrev;
   double priceOpen_valuePrev;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(macdMain_value, 0, currentLow, currentHigh, stoploss, highestPriceDuringGreen, lowestPriceDuringRed);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double macdMain[];
      double macdSignal[];
      double senkouSpanA[];
      double senkouSpanB[];
      double kijunSen[];
      double tenkanSen[];
      double chikouSpan[];
      CopyBuffer(macdHandle, 0, shift, 2, macdMain);
      CopyBuffer(macdHandle, 1, shift, 2, macdSignal);
      CopyBuffer(ichimokuHandle, 0, shift, 1, tenkanSen);
      CopyBuffer(ichimokuHandle, 1, shift, 1, kijunSen);
      CopyBuffer(ichimokuHandle, 2, shift, 2, senkouSpanA);
      CopyBuffer(ichimokuHandle, 3, shift, 2, senkouSpanB);
      CopyBuffer(ichimokuHandle, 4, shift, 1, chikouSpan);
      macdMain_value = macdMain[1];
      macdSignal_value = macdSignal[1];
      macdMainPrev_value = macdMain[0];
      macdSignalPrev_value = macdSignal[0];
      senkouSpanA_valuePrev = senkouSpanA[0];
      senkouSpanB_valuePrev = senkouSpanB[0];
      senkouSpanA_value = senkouSpanA[1];
      senkouSpanB_value = senkouSpanB[1];
      kijunSen_value = kijunSen[0];
      tenkanSen_value = tenkanSen[0];
      priceClose_valuePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      double prevSpanMax = MathMax(senkouSpanA_valuePrev, senkouSpanB_valuePrev);
      double prevSpanMin = MathMin(senkouSpanA_valuePrev, senkouSpanB_valuePrev);
      double spanMax = MathMax(senkouSpanA_value, senkouSpanB_value);
      double spanMin = MathMin(senkouSpanA_value, senkouSpanB_value);
      signals.buy = macdMain_value > 0 && priceClose_valuePrev < prevSpanMax && price > spanMax;
      signals.sell = macdMain_value < 0 && priceClose_valuePrev > prevSpanMin && price < spanMin;
      signals.closeBuy = price <= spanMax;
      signals.closeSell = price >= spanMin;

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
   macdHandle = iMACD(_Symbol, SelectedTimeframe, fast_ema_period, slow_ema_period, signal_period, PriceType);
   ichimokuHandle = iIchimoku(_Symbol, SelectedTimeframe, tenkan_sen, kijun_sen, senkou_span_b);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighest(shift, macdHandle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (macdHandle != INVALID_HANDLE)
      IndicatorRelease(macdHandle);
   if (ichimokuHandle != INVALID_HANDLE)
      IndicatorRelease(ichimokuHandle);

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
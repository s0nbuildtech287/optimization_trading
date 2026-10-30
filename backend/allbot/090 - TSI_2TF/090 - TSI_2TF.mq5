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
input double lotThreshold = 0;                         // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                        // Magic number for the EA
input double riskMoney = 100;                          // Risk Money
input bool AcceptBuy = true;                           // Enable Buy Orders
input bool AcceptSell = false;                         // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;   // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;     // Order Entry Mode
input ENUM_TIMEFRAMES SelectedTimeframeH = PERIOD_H4;  // Selected SelectedTimeframe for HTF
input ENUM_TIMEFRAMES SelectedTimeframeL = PERIOD_H1;  // Selected SelectedTimeframe for LTF
input int Trend_SlowPeriod = 50;                       // Period for the TSI indicator HTF
input int Trend_FastPeriod = 25;                       // Smoothing period for the TSI indicator HTF
input ENUM_APPLIED_PRICE TSIPrice_Trend = PRICE_CLOSE; // Price type for the TSI indicator HTF
input int Entry_SlowPeriod = 13;                       // Period for the TSI indicator LTF
input int Entry_FastPeriod = 7;                        // Smoothing period for the TSI indicator LTF
input ENUM_APPLIED_PRICE TSIPrice_Entry = PRICE_CLOSE; // Price type for the TSI indicator LTF
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int tsi_L_handle; // Handle cho TSI H4
int tsi_H_handle; // Handle cho TSI H1

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double tsiTrendColorCurrent; // Giá trị màu TSI H4 hiện tại (1: xanh, 2: cam)
   double tsiTrendColorPrev;    // Giá trị màu TSI H4 trước đó
   double tsiEntryColorCurrent; // Giá trị màu TSI H1 hiện tại
   double tsiEntryColorPrev;    // Giá trị màu TSI H1 trước đó
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(1.5, tsiEntryColorCurrent, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (tsi_H_handle == INVALID_HANDLE || tsi_L_handle == INVALID_HANDLE)
      {
         Print("Lỗi khi lấy handle cho TSI H4 hoặc H1: ", GetLastError());
         return NULL;
      }

      double tsiTrendColorBuffer[];
      double tsiEntryColorBuffer[];
      int copiedTrend = CopyBuffer(tsi_H_handle, 1, shift, 2, tsiTrendColorBuffer);
      int copiedEntry = CopyBuffer(tsi_L_handle, 1, shift, 2, tsiEntryColorBuffer);
      if (copiedTrend <= 0 || copiedEntry <= 0)
      {
         Print("Lỗi khi sao chép dữ liệu buffer màu: ", GetLastError());
         return NULL;
      }

      tsiTrendColorCurrent = tsiTrendColorBuffer[1];
      tsiTrendColorPrev = tsiTrendColorBuffer[0];
      tsiEntryColorCurrent = tsiEntryColorBuffer[1];
      tsiEntryColorPrev = tsiEntryColorBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = tsiTrendColorCurrent == 1 && tsiEntryColorCurrent == 1 && tsiEntryColorPrev == 2; // Xanh H4 và H1
      signals.sell = tsiTrendColorCurrent == 2 && tsiEntryColorCurrent == 2 && tsiEntryColorPrev == 1;

      signals.closeBuy = tsiEntryColorCurrent == 2 ;  // H1 từ xanh sang cam
      signals.closeSell = tsiEntryColorCurrent == 1; // H1 từ cam sang xanh

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
   tsi_H_handle = iCustom(_Symbol, SelectedTimeframeH, "\\Indicators\\TSI", Entry_SlowPeriod, Entry_FastPeriod, TSIPrice_Entry);
   tsi_L_handle = iCustom(_Symbol, SelectedTimeframeL, "\\Indicators\\TSI", Trend_SlowPeriod, Trend_FastPeriod, TSIPrice_Trend);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, tsi_H_handle, 1, 1.5, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframeH);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (tsi_H_handle != INVALID_HANDLE)
      IndicatorRelease(tsi_H_handle);
   if (tsi_L_handle != INVALID_HANDLE)
      IndicatorRelease(tsi_L_handle);
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
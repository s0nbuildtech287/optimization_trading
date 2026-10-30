//+------------------------------------------------------------------+
//|                    002 - Ichimoku Kumo Break                      |
//|                        Copyright 2026, LotusQuant                  |
//|                        https://LotusQuant.com                      |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2024, The Blue Teams Academy"
#property link "https://LotusQuant.com"
#property version "1.00"
#include <Trade/LotusQuantLibrary.mqh>

CTradeCustomEx tradeCustom;

// ===== INPUT PARAMETERS =====
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect

input int Tenken_Sen = 9;     // Tenkan-Sen Period
input int Kinjun_Sen = 26;    // Kinjun-Sen Period
input int Sekoun_Span_B = 52; // Senkou Span B Period
input int SL_Lookback = 30;   // Lookback period for stop loss calculation

// ===== RUNTIME VARIABLES =====
datetime lastBarTime = iTime(_Symbol, SelectedTimeframe, 0);
double stoploss = 0.0;

// Indicator handles
int iIchimokuHandle = 0;

double Cus1[];
double Cus2[];
double Cus3[];
double Cus4[];

datetime nextCandleTime;
bool processedThisCandle = false;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double tenkanSen;
   double kinjunSen;
   double senkou1;
   double senkou2;
   double chikou;

   // Previous values for signals
   double tenkanSenPrev;
   double kinjunSenPrev;
   double senkou1Prev;
   double senkou2Prev;

   double closePrice;
   double closePrev;

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      if (handleValues == NULL)
      {
         Print("Error: Failed to get indicator values");
         return;
      }

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (signals.buy)
         stoploss = tradeCustom.CalculateDynamicStoploss(true, SL_Lookback, shift + 1, SelectedTimeframe);
      else if (signals.sell)
         stoploss = tradeCustom.CalculateDynamicStoploss(false, SL_Lookback, shift + 1, SelectedTimeframe);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney,
                             lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (iIchimokuHandle == 0)
      {
         Print("Error: Ichimoku handle not initialized.");
         return NULL;
      }

      // Get price data
      closePrice = iClose(_Symbol, SelectedTimeframe, shift);
      closePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      int copied1 = CopyBuffer(iIchimokuHandle, 0, shift, 2, Cus1); // Tenkan-Sen
      int copied2 = CopyBuffer(iIchimokuHandle, 1, shift, 2, Cus2); // Kinjun-Sen
      int copied3 = CopyBuffer(iIchimokuHandle, 2, shift, 2, Cus3); // Senkou Span A
      int copied4 = CopyBuffer(iIchimokuHandle, 3, shift, 2, Cus4); // Senkou Span B

      if (copied1 <= 0 || copied2 <= 0 || copied3 <= 0 || copied4 <= 0)
      {
         Print("Error: CopyBuffer failed. Error code: ", GetLastError());
         return NULL;
      }

      tenkanSen = Cus1[1];
      kinjunSen = Cus2[1];
      senkou1 = Cus3[1];
      senkou2 = Cus4[1];

      tenkanSenPrev = Cus1[0];
      kinjunSenPrev = Cus2[0];
      senkou1Prev = Cus3[0];
      senkou2Prev = Cus4[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      // Entry signals - Cloud breakout && Tenkan-Kinjun cross

      signals.buy = (senkou1 > senkou2 && closePrice > senkou1 && closePrev < senkou1Prev && tenkanSen > kinjunSen && closePrice > kinjunSen);

      signals.sell = (senkou1 < senkou2 && closePrice < senkou1 && closePrev > senkou1Prev && tenkanSen < kinjunSen && closePrice < kinjunSen);

      // Exit signals
      signals.closeBuy = tenkanSen <= kinjunSen || closePrice < senkou1;
      signals.closeSell = tenkanSen >= kinjunSen || closePrice > senkou1;

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

   // Initialize Ichimoku indicator
   iIchimokuHandle = iIchimoku(_Symbol, SelectedTimeframe, Tenken_Sen, Kinjun_Sen, Sekoun_Span_B);

   if (iIchimokuHandle == INVALID_HANDLE)
   {
      Print("Error: Failed to create Ichimoku indicator handle");
      return (INIT_FAILED);
   }

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (iIchimokuHandle != INVALID_HANDLE)
      IndicatorRelease(iIchimokuHandle);

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

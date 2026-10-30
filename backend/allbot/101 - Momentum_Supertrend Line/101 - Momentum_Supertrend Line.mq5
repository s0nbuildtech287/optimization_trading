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
input int InpPeriodMomentum = 14;                    // Period for Momentum
input int ATRPeriod = 22;                            // Period for ATR in Supertrend
input double Multiplier = 3.0;                       // ATR multiplier for Supertrend
input int momentumLevel = 100;                       // Level for Momentum (100 is the centerline)
input ENUM_APPLIED_PRICE SourcePrice = PRICE_MEDIAN; // Price source for Supertrend
input bool TakeWicksIntoAccount = true;              // Include wicks in Supertrend

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int momentum_handle;   // Handle cho Momentum
int supertrend_handle; // Handle cho Supertrend

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double momentumValue;       // Giá trị Momentum
   double supertrendValue;     // SuperTrendBuffer
   double supertrendDirection; // SuperTrendDirectionBuffer (1 = Up, -1 = Down)
   double prevLow;             // Giá low của nến trước
   double prevHigh;            // Giá high của nến trước
   double prevMomentum;        // Giá trị Momentum của nến trước

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(momentumValue - 100.0, 0, currentLow, currentHigh,
                                      stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (momentum_handle == INVALID_HANDLE || supertrend_handle == INVALID_HANDLE)
      {
         Print("Lỗi khi lấy handle cho Momentum hoặc Supertrend: ", GetLastError());
         return NULL;
      }

      double momentumBuffer[], supertrendBuffer[], supertrendDirectionBuffer[];
      int copiedMomentum = CopyBuffer(momentum_handle, 0, shift, 2, momentumBuffer);           // Momentum value
      int copiedST = CopyBuffer(supertrend_handle, 0, shift, 2, supertrendBuffer);             // Supertrend value
      int copiedSTDir = CopyBuffer(supertrend_handle, 2, shift, 2, supertrendDirectionBuffer); // Direction

      double lowBuffer[], highBuffer[];
      int copiedLow = CopyLow(_Symbol, SelectedTimeframe, shift, 2, lowBuffer);
      int copiedHigh = CopyHigh(_Symbol, SelectedTimeframe, shift, 2, highBuffer);
      momentumValue = momentumBuffer[1];
      prevMomentum = momentumBuffer[0];
      supertrendValue = supertrendBuffer[1];
      supertrendDirection = supertrendDirectionBuffer[1];
      prevLow = lowBuffer[0];
      prevHigh = highBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = supertrendDirection == 1 &&
                    momentumValue > momentumLevel &&
                    prevMomentum < momentumLevel;

      signals.sell = supertrendDirection == -1 &&
                     momentumValue < momentumLevel &&
                     prevMomentum > momentumLevel;

      signals.closeBuy = momentumValue <= momentumLevel;

      signals.closeSell = momentumValue >= momentumLevel;
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
   momentum_handle = iMomentum(_Symbol, SelectedTimeframe, InpPeriodMomentum, PRICE_CLOSE);

   supertrend_handle = iCustom(_Symbol, SelectedTimeframe, "supertrend_101",
                               ATRPeriod, Multiplier, SourcePrice, TakeWicksIntoAccount);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, momentum_handle, 0, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (momentum_handle != INVALID_HANDLE)
      IndicatorRelease(momentum_handle);
   if (supertrend_handle != INVALID_HANDLE)
      IndicatorRelease(supertrend_handle);
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
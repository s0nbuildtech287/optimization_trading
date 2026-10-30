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
enum ENUM_LINE_TYPE
{
   EXM_EXM,  // 0: By 2 extremums
   EXM_DELTA // 1: Extremum and delta
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input ENUM_LINE_TYPE InpLineType = EXM_DELTA;        // Line type
input int InpLeftExmSide = 20;                       // Left extremum side (Type 1, 2)
input int InpRightExmSide = 3;                       // Right extremum side (Type 1)
input int InpFromCurrent = 3;                        // Offset from the current bar (Type 2)
input int linesWidth = 2;                            // Lines Width
input double thereshold = 0.0001;                    // Threshold for trend detection
input int maximumBars = 1000;                        // Maximum bars to process
input ENUM_APPLIED_PRICE RSI_Apply = PRICE_TYPICAL;  // RSI Apply To
input int RSI_Period = 2;                            // RSI Period
input int RSI_Level = 50;                            // RSI level
input int StoplossBars = 60;                         // Number of bars to calculate dynamic stoploss
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int autoTrendHanle;
int rsiHandle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double supporrValue;
   double resistanceValue;
   double rsiValue;
   double rsiValuePrve;
   double trendValue;
   double pricePrevious;
   double rsiPrevious;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (signals.buy && AcceptBuy)
         stoploss = tradeCustom.CalculateDynamicStoploss(true, StoplossBars, shift, SelectedTimeframe);
      else if (signals.sell && AcceptSell)
         stoploss = tradeCustom.CalculateDynamicStoploss(false, StoplossBars, shift, SelectedTimeframe);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (autoTrendHanle == INVALID_HANDLE || rsiHandle == INVALID_HANDLE)
      {
         Print("Error getting handle :", GetLastError());
         return NULL;
      }
      double spBuffer[];
      double resBuffer[];
      double rsiBuffer[];
      double trendBuffer[];
      int copiedSp = CopyBuffer(autoTrendHanle, 0, shift, 1, spBuffer);
      int copiedRes = CopyBuffer(autoTrendHanle, 1, shift, 1, resBuffer);
      int copiedRsi = CopyBuffer(rsiHandle, 0, shift, 2, rsiBuffer);
      int copiedTrend = CopyBuffer(autoTrendHanle, 2, shift, 1, trendBuffer);
      // Gán giá trị vào chính instance
      supporrValue = spBuffer[0];
      resistanceValue = resBuffer[0];
      rsiValue = rsiBuffer[1];
      trendValue = trendBuffer[0];
      rsiPrevious = rsiBuffer[0];
      pricePrevious = iClose(_Symbol, _Period, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = price > supporrValue && rsiValue > RSI_Level && rsiPrevious < RSI_Level;
      signals.sell = price < resistanceValue && rsiValue < RSI_Level && rsiPrevious > RSI_Level;
      signals.closeBuy = rsiValue <= RSI_Level;
      signals.closeSell = rsiValue >= RSI_Level;

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
   autoTrendHanle = iCustom(_Symbol, SelectedTimeframe, "AutoTrendLine", InpLineType, InpLeftExmSide, InpRightExmSide, false, linesWidth, true, true, thereshold, true, maximumBars);
   rsiHandle = iRSI(_Symbol, SelectedTimeframe, RSI_Period, RSI_Apply);
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
   if (autoTrendHanle != INVALID_HANDLE)
      IndicatorRelease(autoTrendHanle);
   if (rsiHandle != INVALID_HANDLE)
      IndicatorRelease(rsiHandle);

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
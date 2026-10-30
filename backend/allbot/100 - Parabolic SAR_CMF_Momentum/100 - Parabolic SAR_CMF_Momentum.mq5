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
input double stepSAR = 0.02;                         // Step SAR
input double maximumSAR = 0.2;                       // Maximum SAR
input int momentumPeriod = 14;                       // Momentum Period
input int CMFPeriod = 20;                            // CMF period
input int momentumLevel = 100;                       // Level for Momentum (100 is the centerline)

ENUM_APPLIED_PRICE momentumPrice = PRICE_CLOSE;

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int psar_handle;
int cmf_handle;
int momentum_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double psar_now;
   double psar_prev;
   double close_prev;
   double cmf_now;
   double cmf_prev;
   double mtm_now;
   double mtm_prev;
   double psar_entry_point;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      stoploss = psar_now;
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (psar_handle == INVALID_HANDLE || cmf_handle == INVALID_HANDLE || momentum_handle == INVALID_HANDLE)
      {
         Print("Loi: chua tao duoc chi bao!");
         return NULL;
      }
      double psar_buf[], cmf_buf[], mtm_buf[], close_buf[];
      // PSAR: buffer 0
      CopyBuffer(psar_handle, 0, shift, 2, psar_buf);
      // CMF: buffer 0
      CopyBuffer(cmf_handle, 0, shift, 2, cmf_buf);
      // Momentum: buffer 0
      CopyBuffer(momentum_handle, 0, shift, 2, mtm_buf);
      // Close Price
      psar_now = psar_buf[1];
      psar_prev = psar_buf[0];
      cmf_now = cmf_buf[1];
      cmf_prev = cmf_buf[0];
      mtm_now = mtm_buf[1];
      mtm_prev = mtm_buf[0];
      close_prev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      if (psar_prev > close_prev && psar_now < price &&
          cmf_now > 0 && mtm_now > momentumLevel)
      {
         signals.buy = true;
      }

      if (psar_prev < close_prev && psar_now > price &&
          cmf_now < 0 && mtm_now < momentumLevel)
      {
         signals.sell = true;
      }

      signals.closeBuy = psar_now >= price;
      signals.closeSell = psar_now <= price;

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
   psar_handle = iSAR(_Symbol, SelectedTimeframe, stepSAR, maximumSAR);
   cmf_handle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Chaikin_Money_Flow", CMFPeriod);
   momentum_handle = iMomentum(_Symbol, SelectedTimeframe, momentumPeriod, momentumPrice);
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
   if (psar_handle != INVALID_HANDLE)
      IndicatorRelease(psar_handle);
   if (cmf_handle != INVALID_HANDLE)
      IndicatorRelease(cmf_handle);
   if (momentum_handle != INVALID_HANDLE)
      IndicatorRelease(momentum_handle);
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
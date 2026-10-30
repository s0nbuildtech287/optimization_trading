
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
input double lotThreshold = 0;                        // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                       // Magic number for the EA
input double riskMoney = 100;                         // Risk Money
input bool AcceptBuy = true;                          // Enable Buy Orders
input bool AcceptSell = false;                        // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;  // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;    // Order Entry Mode
input int CCI_Period = 14;                            // CCI Period
input int OBV_SMA_Period = 20;                        // OBV SMA Period
input int AD_SMA_Period = 20;                         // A/D SMA Period
input double CciBuy = 100;                            // CCI Buy level
input double CciSell = -100;                          // CCI Sell level
input int cciStopLoss = 100;                          // CCI Stop Loss
input ENUM_APPLIED_PRICE CCI_ApplyTo = PRICE_TYPICAL; // CCI Apply To

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int cci_handle;
int obv_handle;
int ad_handle;
int obv_sma_handle;
int ad_sma_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double obv_value;
   double obv_sma_value;
   double ad_value;
   double ad_sma_value;
   double cci_value;
   double cciPrve_value;

   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(cci_value, cciStopLoss, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      double cci_buffer[];
      double obv_buffer[];
      double ad_buffer[];
      double obv_sma_buffer[];
      double ad_sma_buffer[];

      CopyBuffer(cci_handle, 0, shift, 2, cci_buffer);
      CopyBuffer(obv_handle, 0, shift, 1, obv_buffer);
      CopyBuffer(ad_handle, 0, shift, 1, ad_buffer);
      CopyBuffer(obv_sma_handle, 0, shift, 1, obv_sma_buffer);
      CopyBuffer(ad_sma_handle, 0, shift, 1, ad_sma_buffer);
      obv_value = obv_buffer[0];
      obv_sma_value = obv_sma_buffer[0];
      ad_value = ad_buffer[0];
      ad_sma_value = ad_sma_buffer[0];
      cci_value = cci_buffer[1];
      cciPrve_value = cci_buffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = obv_value > obv_sma_value && ad_value > ad_sma_value && cci_value > CciBuy && cciPrve_value <= CciBuy;
      signals.sell = obv_value < obv_sma_value && ad_value < ad_sma_value && cci_value < CciSell && cciPrve_value >= CciSell;

      signals.closeBuy = cci_value <= CciBuy;
      signals.closeSell = cci_value >= CciSell;
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
   cci_handle = iCCI(_Symbol, SelectedTimeframe, CCI_Period, CCI_ApplyTo);

   obv_handle = iOBV(_Symbol, SelectedTimeframe, VOLUME_TICK);
   ad_handle = iAD(_Symbol, SelectedTimeframe, VOLUME_TICK);

   obv_sma_handle = iMA(_Symbol, SelectedTimeframe, OBV_SMA_Period, 0, MODE_SMA, obv_handle);
   ad_sma_handle = iMA(_Symbol, SelectedTimeframe, AD_SMA_Period, 0, MODE_SMA, ad_handle);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, cci_handle, 0, cciStopLoss, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{

   if (cci_handle != INVALID_HANDLE)
      IndicatorRelease(cci_handle);
   if (obv_handle != INVALID_HANDLE)
      IndicatorRelease(obv_handle);
   if (ad_handle != INVALID_HANDLE)
      IndicatorRelease(ad_handle);
   if (obv_sma_handle != INVALID_HANDLE)
      IndicatorRelease(obv_sma_handle);
   if (ad_sma_handle != INVALID_HANDLE)
      IndicatorRelease(ad_sma_handle);
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
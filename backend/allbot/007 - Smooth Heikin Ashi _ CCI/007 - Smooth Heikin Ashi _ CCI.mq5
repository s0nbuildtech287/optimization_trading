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
enum enMaTypes
{
  ma_sma,  // Simple moving average
  ma_ema,  // Exponential moving average
  ma_smma, // Smoothed MA
  ma_lwma  // Linear weighted MA
};
// Inputs
input double lotThreshold = 0;                            // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                           // Magic number for the EA
input double riskMoney = 100;                             // Risk Money
input bool AcceptBuy = true;                              // Enable Buy Orders
input bool AcceptSell = false;                            // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;      // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;        // Order Entry Mode
input int CCILevel = 100;                                 // CCI  Level
input int inpMaPeriod = 7;                                // Smoothing period
input enMaTypes inpMaMetod = ma_lwma;                     // Smoothing method
input int inpStep = 0;                                    // Step size
input int CCIMaPeriod = 14;                               // CCI Ma Period
input ENUM_APPLIED_PRICE CCIAppliedPrice = PRICE_TYPICAL; // CCI Applied Price

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ha_handle;
int handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
  double ApplyBuy;
  double ApplySell;
  // Indicator values
  double cci_value;     // CCI Value
  double cci_valuePrev; // CCI Value
  double ha_color;      // Heikin Ashi Color

  // Variables for tracking price extremes

  void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
  {
    HandleValuesBase *baseValues = GetIndicatorValues(shift);
    HandleValues *handleValues = (HandleValues *)baseValues;

    TradingSignals signals = EvaluateTradingSignals(handleValues, price);
    tradeCustom.UpdateSLUpDownValue(1.5, ha_color, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

    ApplyBuy = signals.buy && !signals.closeBuy;
    ApplySell = signals.sell && !signals.closeSell;
    tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
    tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
  }

  HandleValuesBase *GetIndicatorValues(int shift) override
  {

    double cci_ar[];
    double ha_color_ar[];

    CopyBuffer(ha_handle, 4, shift, 1, ha_color_ar);
    CopyBuffer(handle, 0, shift, 2, cci_ar);

    cci_value = cci_ar[1];
    cci_valuePrev = cci_ar[0];
    ha_color = ha_color_ar[0];

    return GetPointer(this);
  }

  TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
  {
    TradingSignals signals = {false, false, false, false};
    signals.buy = cci_value > CCILevel && cci_valuePrev < CCILevel && ha_color == 1.0;
    signals.sell = cci_value < CCILevel && cci_valuePrev > CCILevel && ha_color == 2.0;
    signals.closeBuy = cci_value <= CCILevel || ha_color == 2.0;
    signals.closeSell = cci_value >= CCILevel || ha_color == 1.0;

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
  ha_handle = iCustom(_Symbol, PERIOD_CURRENT, "Heiken_Ashi_Smoothed", inpMaPeriod, inpMaMetod, inpStep);
  handle = iCCI(_Symbol, PERIOD_CURRENT, CCIMaPeriod, CCIAppliedPrice);
  if (g_handleValues == NULL)
    g_handleValues = new HandleValues();

  int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
  Sleep(1000);
  tradeCustom.CalculatePreviousLowestAndHighestValue(shift, ha_handle, 4, 1.5, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

  return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
  if (ha_handle != INVALID_HANDLE)
    IndicatorRelease(ha_handle);
  if (handle != INVALID_HANDLE)
    IndicatorRelease(handle);


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
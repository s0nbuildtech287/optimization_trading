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
input ENUM_MA_METHOD ma_method = MODE_SMA;           // Fast MA Method
input int MA_Period = 20;                            //  Fast MA Period
ENUM_APPLIED_PRICE SMA_Apply = PRICE_TYPICAL;        // Fast MA Apply To

input ENUM_MA_METHOD ma_method_slow = MODE_SMA;    // Slow MA Method
input int MA_Period_slow = 40;                     //  Slow MA Period
ENUM_APPLIED_PRICE SMA_Apply_slow = PRICE_TYPICAL; // Slow MA Apply To

input ENUM_MA_METHOD ma_obv_method = MODE_SMA; // OBV MA Method
input int ma_obv_period = 20;                  // OBV MA Period

input int vi_length = 14; // Vortex Length
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
double lowestSinceLastCross = 0.0;
double highestSinceLastCross = 0.0;
int lastRVICrossIndex = -1;
// Indicator handles
int ma_handle;
int ma_slow_handle;
int ma_obv_handle;
int obv_handle;
int vortex_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double maValue;
    double maslowValue;
    double obvValue;
    double vortexPlusValue;
    double vortexPlusValuePrev;
    double vortexMinusValue;
    double vortexMinusValuePrev;
    double ma_obvValue;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(vortexPlusValue, vortexMinusValue, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        double maValueBufer[];
        double obvValueBufer[];
        double ma_obvValueBufer[];
        double vortexPlusValueBufer[];
        double vortexMinusValueBufer[];
        double ma_slowValueBufer[];
        int copied_ma = CopyBuffer(ma_handle, 0, shift, 1, maValueBufer);
        int copied_obv = CopyBuffer(obv_handle, 0, shift, 1, obvValueBufer);
        int copied_ma_obv = CopyBuffer(ma_obv_handle, 0, shift, 1, ma_obvValueBufer);
        int copied_vortex_plus = CopyBuffer(vortex_handle, 0, shift, 2, vortexPlusValueBufer);
        int copied_vortex_minus = CopyBuffer(vortex_handle, 1, shift, 2, vortexMinusValueBufer);
        int copied_ma_slow = CopyBuffer(ma_slow_handle, 0, shift, 1, ma_slowValueBufer);

        maValue = maValueBufer[0];
        maslowValue = ma_slowValueBufer[0];
        obvValue = obvValueBufer[0];
        ma_obvValue = ma_obvValueBufer[0];
        vortexPlusValue = vortexPlusValueBufer[1];
        vortexPlusValuePrev = vortexPlusValueBufer[0];
        vortexMinusValue = vortexMinusValueBufer[1];
        vortexMinusValuePrev = vortexMinusValueBufer[0];

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = maValue > maslowValue && vortexPlusValuePrev < vortexMinusValuePrev && vortexPlusValue > vortexMinusValue && obvValue > ma_obvValue;
        signals.sell = maValue < maslowValue && vortexPlusValuePrev > vortexMinusValuePrev && vortexPlusValue < vortexMinusValue && obvValue < ma_obvValue;
        signals.closeBuy = vortexPlusValue <= vortexMinusValue;
        signals.closeSell = vortexPlusValue >= vortexMinusValue;
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
    ma_handle = iMA(_Symbol, SelectedTimeframe, MA_Period, 0, ma_method, SMA_Apply);
    ma_slow_handle = iMA(_Symbol, SelectedTimeframe, MA_Period_slow, 0, ma_method_slow, SMA_Apply_slow);

    obv_handle = iOBV(_Symbol, SelectedTimeframe, 0);
    ma_obv_handle = iMA(_Symbol, SelectedTimeframe, ma_obv_period, 0, ma_obv_method, obv_handle);
    vortex_handle = iCustom(_Symbol, SelectedTimeframe, "Vortex", vi_length);
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000);
    tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, vortex_handle, 0, vortex_handle, 1, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);
    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (ma_handle != INVALID_HANDLE)
        IndicatorRelease(ma_handle);
    if (ma_slow_handle != INVALID_HANDLE)
        IndicatorRelease(ma_slow_handle);
    if (obv_handle != INVALID_HANDLE)
        IndicatorRelease(obv_handle);
    if (ma_obv_handle != INVALID_HANDLE)
        IndicatorRelease(ma_obv_handle);
    if (vortex_handle != INVALID_HANDLE)
        IndicatorRelease(vortex_handle);

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
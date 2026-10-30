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
input int rviPeriod = 20;                             // RVI Period
input int fast_ema_period = 12;                       // Fast EMA period for MACD
input int slow_ema_period = 26;                       // Slow EMA period for MACD
input int signal_period = 9;                          // Signal period for MACD
input ENUM_APPLIED_PRICE applied_price = PRICE_CLOSE; // Price type for MACD
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int lastRVICrossIndex = -1;
double lowestSinceLastCross = DBL_MAX;
double highestSinceLastCross = 0.0;
// Indicator handles
int Rvi_handle;
int Macd_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double macdValue;
    double rviValue;
    double rviSingleValue;
    double rviValuePrev;
    double rviSingleValuePrev;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(rviValue, rviSingleValue, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (Rvi_handle == INVALID_HANDLE || Macd_handle == INVALID_HANDLE)
            return NULL;
        double rvi_buffer[], macd_buffer[], rviSingle_buffer[];
        int copiedBbtrendHTF = CopyBuffer(Rvi_handle, 0, shift, 2, rvi_buffer);
        int copiedBbtrendLTF = CopyBuffer(Macd_handle, 0, shift, 1, macd_buffer);
        int copiedRviSingle = CopyBuffer(Rvi_handle, 1, shift, 2, rviSingle_buffer);
        macdValue = macd_buffer[0];
        rviValue = rvi_buffer[1];
        rviSingleValue = rviSingle_buffer[1];
        rviValuePrev = rvi_buffer[0];
        rviSingleValuePrev = rviSingle_buffer[0];
        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = (rviValue > rviSingleValue && rviValuePrev < rviSingleValuePrev && macdValue > 0);
        signals.sell = (rviValue < rviSingleValue && rviValuePrev > rviSingleValuePrev && macdValue < 0);
        signals.closeBuy = rviValue <= rviSingleValue;
        signals.closeSell = rviValue >= rviSingleValue;

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
    Rvi_handle = iRVI(_Symbol, SelectedTimeframe, rviPeriod);
    Macd_handle = iMACD(_Symbol, SelectedTimeframe, fast_ema_period, slow_ema_period, signal_period, applied_price);
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000);
    tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, Rvi_handle, 0, Rvi_handle, 1, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);

    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (Rvi_handle != INVALID_HANDLE)
        IndicatorRelease(Rvi_handle);
    if (Macd_handle != INVALID_HANDLE)
        IndicatorRelease(Macd_handle);

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
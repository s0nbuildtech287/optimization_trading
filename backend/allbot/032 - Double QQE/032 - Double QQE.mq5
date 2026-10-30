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
input int rsi_Period_slow = 14;                      // RSI period for slow QQE
input int SF_slow = 5;                               // Smoothing factor for slow QQE
input double WF_slow = 4.236;

input int rsi_Period_fast = 41; // RSI period for fast QQE
input int SF_fast = 15;         // Smoothing factor for fast QQE
input double WF_fast = 4.236;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int qqe_handle_slow;
int qqe_handle_fast;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double qqe_red_slow;
    double qqe_green_fast;
    double qqe_green_fastPrev;
    double qqe_red_fast;
    double qqe_red_fastPrev;
    double qqe_green_slow;
    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(qqe_green_fast, qqe_red_fast, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (qqe_handle_fast == INVALID_HANDLE || qqe_handle_slow == INVALID_HANDLE)
            return NULL;

        double qqe_red_slowBuffer[];
        double qqe_red_fastBuffer[];
        double qqe_green_fastBuffer[];
        double qqe_green_slowBuffer[];
        CopyBuffer(qqe_handle_slow, 1, shift, 1, qqe_red_slowBuffer);
        CopyBuffer(qqe_handle_slow, 0, shift, 1, qqe_green_slowBuffer);
        CopyBuffer(qqe_handle_fast, 1, shift, 2, qqe_red_fastBuffer);
        CopyBuffer(qqe_handle_fast, 0, shift, 2, qqe_green_fastBuffer);

        qqe_red_slow = qqe_red_slowBuffer[0];
        qqe_green_slow = qqe_green_slowBuffer[0];
        qqe_red_fast = qqe_red_fastBuffer[1];
        qqe_green_fast = qqe_green_fastBuffer[1];
        qqe_red_fastPrev = qqe_red_fastBuffer[0];
        qqe_green_fastPrev = qqe_green_fastBuffer[0];

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};
        signals.buy = qqe_green_slow > qqe_red_slow && qqe_green_fastPrev < qqe_red_fastPrev && qqe_green_fast > qqe_red_fast;
        signals.sell = qqe_green_slow < qqe_red_slow && qqe_green_fastPrev > qqe_red_fastPrev && qqe_green_fast < qqe_red_fast;
        signals.closeBuy = qqe_green_fast <= qqe_red_fast;
        signals.closeSell = qqe_green_fast >= qqe_red_fast;

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
    qqe_handle_slow = iCustom(_Symbol, SelectedTimeframe, "SqQQE", rsi_Period_slow, SF_slow, WF_slow);

    qqe_handle_fast = iCustom(_Symbol, SelectedTimeframe, "SqQQE", rsi_Period_fast, SF_fast, WF_fast);
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000);
    tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, qqe_handle_fast, 1, qqe_handle_fast, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (qqe_handle_slow != INVALID_HANDLE)
        IndicatorRelease(qqe_handle_slow);
    if (qqe_handle_fast != INVALID_HANDLE)
        IndicatorRelease(qqe_handle_fast);

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
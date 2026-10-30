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
enum StoplossSource
{
    STOPLOSS_FASTEST, // Fastest
    STOPLOSS_SLOW,    // Slow
    STOPLOSS_SLOWEST  // Slowest
};
// Inputs
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input StoplossSource StoplossChoice = STOPLOSS_FASTEST; // Choose stoploss mode
input int FastestATRPeriod = 10;                        // Fastest ATR period
input double FastestMultiplier = 1.5;                   // Fastest ATR multiplier
input int SlowATRPeriod1 = 20;                          // Slow1 ATR period
input double SlowMultiplier1 = 2.0;                     // Slow1 ATR multiplier
input int SlowATRPeriod2 = 40;                          // Slow2 ATR period
input double SlowMultiplier2 = 3.0;                     // Slow2 ATR multiplier
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int handleFastest, handleSlow1, handleSlow2;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double colorSlow1;
    double colorSlow2;
    double colorFastest;
    double colorFastestPrev;
    double colorSlow1Prev;
    double colorSlow2Prev;
    double slow1Value;
    double slow2Value;
    double fastValue;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        switch (StoplossChoice)
        {
        case STOPLOSS_FASTEST:
            stoploss = fastValue;
            break;
        case STOPLOSS_SLOW:
            stoploss = slow1Value;
            break;
        case STOPLOSS_SLOWEST:
            stoploss = slow2Value;
            break;
        }

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        double bufferFastest[], bufferSlow1[], bufferSlow2[], supertrendBuf[], slow1ValueBuf[], slow2ValueBuf[];
        CopyBuffer(handleFastest, 3, shift, 2, bufferFastest);
        CopyBuffer(handleSlow1, 3, shift, 2, bufferSlow1);
        CopyBuffer(handleSlow2, 3, shift, 2, bufferSlow2);
        CopyBuffer(handleFastest, 2, shift, 1, supertrendBuf);
        CopyBuffer(handleSlow1, 2, shift, 1, slow1ValueBuf);
        CopyBuffer(handleSlow2, 2, shift, 1, slow2ValueBuf);
        fastValue = supertrendBuf[0];
        slow1Value = slow1ValueBuf[0];
        slow2Value = slow2ValueBuf[0];
        colorFastest = bufferFastest[1];
        colorFastestPrev = bufferFastest[0];
        colorSlow1 = bufferSlow1[1];
        colorSlow2 = bufferSlow2[1];

        // Store previous values
        colorSlow1Prev = bufferSlow1[0];
        colorSlow2Prev = bufferSlow2[0];

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {

        TradingSignals signals = {false, false, false, false};
        signals.buy = colorSlow1 == 0 && colorSlow2 == 0 && colorFastest == 0 && colorFastestPrev == 1;
        signals.sell = colorSlow1 == 1 && colorSlow2 == 1 && colorFastest == 1 && colorFastestPrev == 0;
        signals.closeBuy = colorFastest == 1;
        signals.closeSell = colorFastest == 0;

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
    handleFastest = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\supertrend_028.ex5", FastestATRPeriod, FastestMultiplier);
    handleSlow1 = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\supertrend_028.ex5", SlowATRPeriod1, SlowMultiplier1);
    handleSlow2 = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\supertrend_028.ex5", SlowATRPeriod2, SlowMultiplier2);
    if (handleFastest == INVALID_HANDLE || handleSlow1 == INVALID_HANDLE || handleSlow2 == INVALID_HANDLE)
    {
        return (INIT_FAILED);
    }
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
    if (handleFastest != INVALID_HANDLE)
        IndicatorRelease(handleFastest);
    if (handleSlow1 != INVALID_HANDLE)
        IndicatorRelease(handleSlow1);
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
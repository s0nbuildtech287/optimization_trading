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
input int JawPeriod = 13;
input int TeethPeriod = 8;
input int LipsPeriod = 5;
int JawShift = 5;
int TeethShift = 5;
int LipsShift = 5;
input ENUM_MA_METHOD MA_Mode = MODE_SMMA;
input ENUM_APPLIED_PRICE PriceType = PRICE_MEDIAN; // Applied Price

// Runtime globals
double stoploss = 0.0;
double lowestSinceLastCross = 0.0;
double highestSinceLastCross = 0.0;
int lastRVICrossIndex = -1;
// Indicator handles
int handleAlligator;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double jawValue;
    double teethValue;
    double teethValuePrev;
    double lipsValue;
    double lipsValuePrev;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(lipsValue, teethValue, currentLow, currentHigh, stoploss, lowestSinceLastCross, highestSinceLastCross);

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        double jawBuf[], teethBuf[], lipsBuf[];
        if (CopyBuffer(handleAlligator, 0, shift - JawShift, 1, jawBuf) < 0 ||
            CopyBuffer(handleAlligator, 1, shift - TeethShift, 2, teethBuf) < 0 ||
            CopyBuffer(handleAlligator, 2, shift - LipsShift, 2, lipsBuf) < 0)
        {
            Print("Failed to copy Alligator buffers at shift ", shift);
            return NULL;
        }

        jawValue = jawBuf[0];
        teethValue = teethBuf[1];
        lipsValue = lipsBuf[1];
        teethValuePrev = teethBuf[0];
        lipsValuePrev = lipsBuf[0];

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};
        signals.buy = lipsValue > teethValue && teethValue > jawValue && lipsValuePrev < teethValuePrev;
        signals.sell = lipsValue < teethValue && teethValue < jawValue && lipsValuePrev > teethValuePrev;
        signals.closeBuy = lipsValue <= teethValue;
        signals.closeSell = lipsValue >= teethValue;
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
    handleAlligator = iAlligator(_Symbol, SelectedTimeframe,
                                 JawPeriod, JawShift,
                                 TeethPeriod, TeethShift,
                                 LipsPeriod, LipsShift,
                                 MA_Mode, PriceType);
    if (handleAlligator == INVALID_HANDLE)
    {
        Print("Failed to create Alligator handle");
        return INIT_FAILED;
    }
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, handleAlligator, 2, handleAlligator, 1, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);
    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (handleAlligator != INVALID_HANDLE)
        IndicatorRelease(handleAlligator);
        

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
//+------------------------------------------------------------------+
//|                        Copyright 2025, LotusQuant                  |
//|                        https://LotusQuant.com                      |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2025, LotusQuant"
#property link "https://LotusQuant.com"
#property version "1.00"
#include <Trade/LotusQuantLibrary.mqh>
CTradeCustomEx tradeCustom;

// Inputs
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected Timeframe for the EA
input ENUM_TIMEFRAMES SelectedTimeframeHTF = PERIOD_H4; // Selected Timeframe for the HTF
input ENUM_TIMEFRAMES SelectedTimeframeLTF = PERIOD_H1; // Selected Timeframe for the LTF
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input int maHTFPeriod = 20;                             // Moving Average period for Envelopes for HTF
input double deviationHTF = 0.1;                        // Deviation for Envelopes for HTF
input ENUM_APPLIED_PRICE appliedPriceHTF = PRICE_CLOSE; // Price for Envelopes calculation for HTF
input int maLTFPeriod = 20;                             // Moving Average period for Envelopes for LTF
input double deviationLTF = 0.1;                        // Deviation for Envelopes
input ENUM_APPLIED_PRICE appliedPriceLTF = PRICE_CLOSE; // Price for Envelopes calculation for LTF

// Globals and indicator handles
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

int envelopeHTF_handle = INVALID_HANDLE;
int envelopeLTF_handle = INVALID_HANDLE;

double baseLossPerTrade = 0.0;
double currentLossPerTrade = 0.0;
int consecutiveWins = 0;
bool riskResetPending = false;

// Class definition
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator state values
    double envelopeUpHTF_value;
    double envelopeDownHTF_value;
    double envelopeUpLTF_value;
    double envelopeUpLTFPrev_value;
    double envelopeDownLTF_value;
    double envelopeDownLTFPrev_value;
    double closePrev;

    HandleValues() {}

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);

        tradeCustom.UpdateSLUpDownValue(price, envelopeUpLTF_value, currentLow, currentHigh,
                                        stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (envelopeHTF_handle == INVALID_HANDLE || envelopeLTF_handle == INVALID_HANDLE)
        {
            Print("Envelope handles are not initialized.");
            return NULL;
        }

        double envelopeBufferUpHTF[];
        double envelopeBufferDownHTF[];
        double envelopeBufferUpLTF[];
        double envelopeBufferDownLTF[];

        if (CopyBuffer(envelopeHTF_handle, 0, shift, 1, envelopeBufferUpHTF) <= 0 ||
            CopyBuffer(envelopeHTF_handle, 1, shift, 1, envelopeBufferDownHTF) <= 0 ||
            CopyBuffer(envelopeLTF_handle, 0, shift, 2, envelopeBufferUpLTF) <= 0 ||
            CopyBuffer(envelopeLTF_handle, 1, shift, 2, envelopeBufferDownLTF) <= 0)
        {
            Print("Failed to copy Envelope buffers.");
            return NULL;
        }

        envelopeUpHTF_value = envelopeBufferUpHTF[0];
        envelopeDownHTF_value = envelopeBufferDownHTF[0];

        // Note: arr[0] = shift, arr[1] = shift+1
        envelopeUpLTF_value = envelopeBufferUpLTF[1];
        envelopeUpLTFPrev_value = envelopeBufferUpLTF[0];
        envelopeDownLTF_value = envelopeBufferDownLTF[1];
        envelopeDownLTFPrev_value = envelopeBufferDownLTF[0];
        closePrev = iClose(_Symbol, SelectedTimeframeLTF, shift + 1);

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = (price > envelopeUpHTF_value) && (price > envelopeUpLTF_value) &&
                      (closePrev < envelopeUpLTFPrev_value);

        signals.sell = (price < envelopeDownHTF_value) && (price < envelopeDownLTF_value) &&
                       (closePrev > envelopeDownLTFPrev_value);

        signals.closeBuy = price <= envelopeUpLTF_value;
        signals.closeSell = price >= envelopeDownLTF_value;

        return signals;
    }
};

// Global pointer instance (must be declared after class)
HandleValues *g_handleValues = NULL;

// Lifecycle and event handlers
int OnInit()
{
    // Set Magic Number
    trade.SetExpertMagicNumber(MagicNumber);

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

    envelopeHTF_handle = iEnvelopes(_Symbol, SelectedTimeframeHTF, maHTFPeriod, 0, MODE_SMA, appliedPriceHTF, deviationHTF);
    envelopeLTF_handle = iEnvelopes(_Symbol, SelectedTimeframeLTF, maLTFPeriod, 0, MODE_SMA, appliedPriceLTF, deviationLTF);

    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();
    Sleep(1000); // Ensure indicators are initialized
    tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, envelopeLTF_handle, 0,
                                                       lowestPriceDuringRed, highestPriceDuringGreen,
                                                       SelectedTimeframe);

    return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
    if (envelopeHTF_handle != INVALID_HANDLE)
        IndicatorRelease(envelopeHTF_handle);
    if (envelopeLTF_handle != INVALID_HANDLE)
        IndicatorRelease(envelopeLTF_handle);
    if (g_handleValues != NULL)
    {
        delete g_handleValues;
        g_handleValues = NULL;
    }
}

void OnTick()
{
    tradeCustom.OnTick(StaticSignalHandler, OrderEntryOption, SelectedTimeframe);
}

void StaticSignalHandler(double price, double currentLow, double currentHigh, int shift)
{
    if (g_handleValues != NULL)
        g_handleValues.ProcessTickCommon(price, currentLow, currentHigh, shift);
}
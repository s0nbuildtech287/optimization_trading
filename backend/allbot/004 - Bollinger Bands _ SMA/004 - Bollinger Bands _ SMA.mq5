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
enum ENUM_STOPLOSS_METHOD
{
    STOPLOSS_SMA,
    STOPLOSS_BB_TOP_BOTTOM
};
// Inputs
input double lotThreshold = 0;                            // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                           // Magic number for the EA
input double riskMoney = 100;                             // Risk Money
input bool AcceptBuy = true;                              // Enable Buy Orders
input bool AcceptSell = false;                            // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;      // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;        // Order Entry Mode
input ENUM_STOPLOSS_METHOD StoplossMethod = STOPLOSS_SMA; // Stoploss Method: SMA or Price 's Top Bottom
input ENUM_MA_METHOD ma_method = MODE_SMA;                // MA Method

input int SMAPeriod = 100;       // Period for the SMA
input int BBPeriod = 20;         // Period for Bollinger Bands
input double BBMultiplier = 4.0; // Multiplier for Bollinger Bands
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringBelowSMA = 0.0;
double highestPriceDuringAboveSMA = 0.0;

// Indicator handles
int handleSMA;
int handleBB;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double sma;      // SMA value
    double bbUpper;  // Upper Bollinger Band
    double bbLower;  // Lower Bollinger Band
    double bbMiddle; // Middle Bollinger Band
    double bbMiddlePrev;
    double pricePrev;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        switch (StoplossMethod)
        {
        case STOPLOSS_SMA:
            stoploss = sma;
            break;
        case STOPLOSS_BB_TOP_BOTTOM:
            tradeCustom.UpdateSLUpDownValue(price, bbMiddle, currentLow, currentHigh, stoploss, lowestPriceDuringBelowSMA, highestPriceDuringAboveSMA);
            break;
        default:
            break;
        }
        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (handleSMA == INVALID_HANDLE || handleBB == INVALID_HANDLE)
        {
            Print("Error creating handle: ", GetLastError());
            return NULL;
        }

        double sma_ar[];
        double bbUpper_ar[];
        double bbLower_ar[];
        double bbMiddle_ar[];

        int copied_sma = CopyBuffer(handleSMA, 0, shift, 1, sma_ar);
        int copied_bbUpper = CopyBuffer(handleBB, 1, shift, 1, bbUpper_ar);
        int copied_bbLower = CopyBuffer(handleBB, 2, shift, 1, bbLower_ar);
        int copied_bbMiddle = CopyBuffer(handleBB, 0, shift, 2, bbMiddle_ar);

        if (copied_sma <= 0 || copied_bbUpper <= 0 || copied_bbLower <= 0 || copied_bbMiddle <= 0)
        {
            Print("Error copying buffer: ", GetLastError());
            return NULL;
        }

        sma = sma_ar[0];
        bbUpper = bbUpper_ar[0];
        bbLower = bbLower_ar[0];
        bbMiddle = bbMiddle_ar[1];
        bbMiddlePrev = bbMiddle_ar[0];
        pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};
        signals.buy = (price > sma && pricePrev < bbMiddlePrev) && (price > bbMiddle);
        signals.sell = (price < sma && pricePrev > bbMiddlePrev) && (price < bbMiddle);
        signals.closeBuy = (price > bbUpper || price <= bbMiddle);
        signals.closeSell = (price < bbLower || price >= bbMiddle);
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
    handleSMA = iMA(_Symbol, SelectedTimeframe, SMAPeriod, 0, ma_method, PRICE_CLOSE);
    handleBB = iBands(_Symbol, SelectedTimeframe, BBPeriod, 0, BBMultiplier, PRICE_CLOSE);

    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000);
    tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, handleBB, 0, lowestPriceDuringBelowSMA, highestPriceDuringAboveSMA, SelectedTimeframe);
    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (handleSMA != INVALID_HANDLE)
        IndicatorRelease(handleSMA);
    if (handleBB != INVALID_HANDLE)
        IndicatorRelease(handleBB);

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
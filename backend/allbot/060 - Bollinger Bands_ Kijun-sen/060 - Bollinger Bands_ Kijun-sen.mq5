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
input int BBPeriod = 20;                             // Period for Bollinger Bands
input double BBMultiplier = 4.0;                     // Deviations for Bollinger Bands
input ENUM_APPLIED_PRICE bbPrice = PRICE_CLOSE;      // Price type for Bollinger Bands
int shiftband = 0;                                   // Shift for Bollinger Bands
input int kijun_senPeriod = 26;                      // Period for Kijun-sen
input int StoplossBars = 50;                         // Number of bars for Stoploss
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int handleBB;
int ichimokuHandle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double bbUpper;
    double bbLower;
    double bbMiddle;
    double bbMiddlePrev;
    double kijun_sen;
    double bbUpperPrev;
    double bbLowerPrev;
    double pricePrev;
    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        if (AcceptBuy && signals.buy)
        {
            stoploss = tradeCustom.CalculateDynamicStoploss(true, StoplossBars, shift, SelectedTimeframe);
        }
        if (AcceptSell && signals.sell)
        {
            stoploss = tradeCustom.CalculateDynamicStoploss(false, StoplossBars, shift, SelectedTimeframe);
        }

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (ichimokuHandle == INVALID_HANDLE || handleBB == INVALID_HANDLE)
        {
            return NULL;
        }

        double Kijun_senBuffer[], bbUpperBuffer[], bbLowerBuffer[], bbMiddleBuffer[];
        int copiedKijun = CopyBuffer(ichimokuHandle, 1, shift, 1, Kijun_senBuffer); // Copy Kijun-sen from buffer 1
        int copiedBBUpper = CopyBuffer(handleBB, 1, shift, 2, bbUpperBuffer);       // Copy upper band from buffer 1
        int copiedBBMiddle = CopyBuffer(handleBB, 0, shift, 2, bbMiddleBuffer);     // Copy middle band from buffer 0
        int copiedBBLower = CopyBuffer(handleBB, 2, shift, 2, bbLowerBuffer);       // Copy lower band from buffer 2
        if (copiedKijun <= 0 || copiedBBUpper <= 0 || copiedBBMiddle <= 0 || copiedBBLower <= 0)
        {
            return NULL;
        }

        kijun_sen = Kijun_senBuffer[0];
        bbUpper = bbUpperBuffer[1];
        bbLower = bbLowerBuffer[1];
        bbMiddle = bbMiddleBuffer[1];
        bbMiddlePrev = bbMiddleBuffer[0];
        bbUpperPrev = bbUpperBuffer[0];
        bbLowerPrev = bbLowerBuffer[0];
        pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = price > kijun_sen && price > bbLower && pricePrev < bbLowerPrev;
        signals.sell = price < kijun_sen && price < bbUpper && pricePrev > bbUpperPrev;

        signals.closeBuy = price <= bbLower || (pricePrev > bbUpperPrev && price <= bbUpper);
        signals.closeSell = price >= bbUpper || (pricePrev < bbLowerPrev && price >= bbLower);

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
    handleBB = iBands(_Symbol, SelectedTimeframe, BBPeriod, shiftband, BBMultiplier, bbPrice);
    ichimokuHandle = iIchimoku(_Symbol, SelectedTimeframe, 1, kijun_senPeriod, 1);

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
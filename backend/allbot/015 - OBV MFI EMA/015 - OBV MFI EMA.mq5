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
input int MFI_Period = 14;                           // MFI Period
input int OBV_MA_Period = 5;                         // OBV MA Period
input double mfiTarget = 50;                         // MFI target level

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
double lowestSinceLastCross = 0.0;
double highestSinceLastCross = 0.0;
int lastRVICrossIndex = -1;
// Indicator handles

int obv_handle;
int mfi_handle;
int obvMA_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double obvValueCurrent;
    double obvValuePrev;
    double mfiValue;
    double obvMaValueCurrent;
    double obvMaValuePrev;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(obvValueCurrent, obvMaValueCurrent, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (obv_handle == 0 || obvMA_handle == 0 || mfi_handle == 0)
        {
            Print("Error creating handle: ", GetLastError());
            return NULL;
        }
        double obvvalue[];
        double mfivalue[];
        double obvMAvalue[];
        int copied_obv = CopyBuffer(obv_handle, 0, shift, 2, obvvalue);
        int copied_mfi = CopyBuffer(mfi_handle, 0, shift, 2, mfivalue);
        int copied_bulls = CopyBuffer(obvMA_handle, 0, shift, 2, obvMAvalue);
        if (copied_obv < 0 || copied_mfi < 0 || copied_bulls < 0)
        {
            Print("Error copying buffer: ", GetLastError());
            return NULL;
        }
        obvValueCurrent = obvvalue[1];
        obvValuePrev = obvvalue[0];
        mfiValue = mfivalue[0];
        obvMaValueCurrent = obvMAvalue[1];
        obvMaValuePrev = obvMAvalue[0];
        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = mfiValue > mfiTarget && obvValuePrev < obvMaValuePrev && obvValueCurrent > obvMaValueCurrent;
        signals.sell = mfiValue < mfiTarget && obvValuePrev > obvMaValuePrev && obvValueCurrent < obvMaValueCurrent;
        signals.closeBuy = obvValueCurrent <= obvMaValueCurrent;
        signals.closeSell = obvValueCurrent >= obvMaValueCurrent;

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
    obv_handle = iOBV(_Symbol, SelectedTimeframe, VOLUME_TICK);
    mfi_handle = iMFI(_Symbol, SelectedTimeframe, MFI_Period, VOLUME_TICK);
    obvMA_handle = iMA(_Symbol, SelectedTimeframe, OBV_MA_Period, 0, MODE_SMA, obv_handle);
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000);
    tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, obv_handle, 0, obvMA_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (obv_handle != INVALID_HANDLE)
        IndicatorRelease(obv_handle);
    if (mfi_handle != INVALID_HANDLE)
        IndicatorRelease(mfi_handle);   
    if (obvMA_handle != INVALID_HANDLE)
        IndicatorRelease(obvMA_handle);

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
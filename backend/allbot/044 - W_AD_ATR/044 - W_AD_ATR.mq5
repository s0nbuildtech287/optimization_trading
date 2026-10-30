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
input int atrPeriod = 14;                            // ATR period

input int ma_atr_period = 14;                  // ATR MA period
input ENUM_MA_METHOD ma_atr_method = MODE_SMA; // MA ATR Method
input int ma_wad_period = 14;                  // WAD MA period
input ENUM_MA_METHOD ma_wad_method = MODE_SMA; // MA W_A/D Method
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int w_ad_handle;
int atr_handle;
int ma_atr_handle;
int ma_wad_handle;
int lastRVICrossIndex = -1;
double highestSinceLastCross = 0.0;
double lowestSinceLastCross = 0.0;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values

    double wADValue;
    double atrValue;
    double maAtrValue;
    double maWadValue;
    double wADValuePrev;
    double maWadValuePrev;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(wADValue, maWadValue, currentLow, currentHigh, stoploss, lowestSinceLastCross, highestSinceLastCross);

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (w_ad_handle == 0 || atr_handle == 0 || ma_atr_handle == 0 || ma_wad_handle == 0)
        {
            Print("Error: One or more handles are not initialized.");
            return NULL;
        }
        int bar_caculate_wad = BarsCalculated(w_ad_handle);
        int bar_caculate_atr = BarsCalculated(atr_handle);
        int bar_caculate_ma_atr = BarsCalculated(ma_atr_handle);
        int bar_caculate_ma_wad = BarsCalculated(ma_wad_handle);
        if (bar_caculate_wad < 0 || bar_caculate_atr < 0 || bar_caculate_ma_atr < 0 || bar_caculate_ma_wad < 0)
        {
            Print("Error calculating bars: ", GetLastError());
            return NULL;
        }

        double wad_buffer[];
        double atr_buffer[];
        double ma_atr_buffer[];
        double ma_wad_buffer[];
        CopyBuffer(w_ad_handle, 0, shift, 2, wad_buffer);
        CopyBuffer(atr_handle, 0, shift, 1, atr_buffer);
        CopyBuffer(ma_atr_handle, 0, shift, 1, ma_atr_buffer);
        CopyBuffer(ma_wad_handle, 0, shift, 2, ma_wad_buffer);
        wADValue = wad_buffer[1];
        atrValue = atr_buffer[0];
        maAtrValue = ma_atr_buffer[0];
        maWadValue = ma_wad_buffer[1];
        wADValuePrev = wad_buffer[0];
        maWadValuePrev = ma_wad_buffer[0];

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = atrValue > maAtrValue && wADValuePrev < maWadValuePrev && wADValue > maWadValue;
        signals.sell = atrValue < maAtrValue && wADValuePrev > maWadValuePrev && wADValue < maWadValue;
        signals.closeBuy = wADValue <= maWadValue;
        signals.closeSell = wADValue >= maWadValue;
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
    w_ad_handle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Examples\\W_AD");
    atr_handle = iATR(_Symbol, SelectedTimeframe, atrPeriod);
    ma_atr_handle = iMA(_Symbol, SelectedTimeframe, ma_atr_period, 0, ma_atr_method, atr_handle);
    ma_wad_handle = iMA(_Symbol, SelectedTimeframe, ma_wad_period, 0, ma_wad_method, w_ad_handle);

    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000); // Đảm bảo indicator đã sẵn sàng
    tradeCustom.CalculatePreviousLowestAndHighestIndicatorValue(shift, w_ad_handle, 0, ma_wad_handle, 0, lowestSinceLastCross, highestSinceLastCross, SelectedTimeframe);

    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (w_ad_handle != INVALID_HANDLE)
        IndicatorRelease(w_ad_handle);
    if (atr_handle != INVALID_HANDLE)
        IndicatorRelease(atr_handle);
    if (ma_atr_handle != INVALID_HANDLE)
        IndicatorRelease(ma_atr_handle);
    if (ma_wad_handle != INVALID_HANDLE)
        IndicatorRelease(ma_wad_handle);

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
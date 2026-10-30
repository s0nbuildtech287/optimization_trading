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

// Inputs (unchanged)
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected Timeframe for the EA
input ENUM_TIMEFRAMES SelectedTimeframeHTF = PERIOD_H4; // Selected Timeframe for the HTF RSI
input ENUM_TIMEFRAMES SelectedTimeframeLTF = PERIOD_H1; // Selected Timeframe for the LTF RSI
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input int maLTF_period = 34;                            // Ma LTF period
input ENUM_APPLIED_PRICE maLTF_price = PRICE_CLOSE;     // Ma LTF applied price
input ENUM_MA_METHOD maLTF_method = MODE_SMA;           // Ma LTF method
input int maHTF_period = 10;                            // Ma HTF period
input ENUM_MA_METHOD maHTF_method = MODE_SMA;           // Ma HTF method
input ENUM_APPLIED_PRICE maHTF_price = PRICE_CLOSE;     // Ma HTF applied price

// Global runtime variables and indicator handles
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

int maHTF_handle = INVALID_HANDLE;
int maLTF_handle = INVALID_HANDLE;

// Class definition
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double maHTF_value;
    double maLTF_value;
    double maLTFPrev_value;
    double close_Price;

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (maHTF_handle == INVALID_HANDLE || maLTF_handle == INVALID_HANDLE)
        {
            Print("Error: Invalid handle for MA indicators.");
            return NULL;
        }

        double maHTFBuffer[];
        double maLTFBuffer[];
        if (CopyBuffer(maHTF_handle, 0, shift, 1, maHTFBuffer) <= 0 ||
            CopyBuffer(maLTF_handle, 0, shift, 2, maLTFBuffer) <= 0)
        {
            Print("Error copying buffer for MA indicators: ", GetLastError());
            return NULL;
        }

        maHTF_value = maHTFBuffer[0];
        maLTF_value = maLTFBuffer[1];
        maLTFPrev_value = maLTFBuffer[0];
        close_Price = iClose(_Symbol, SelectedTimeframeLTF, shift + 1);

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = price > maHTF_value && price > maLTF_value &&
                      maLTFPrev_value > close_Price;
        signals.sell = price < maHTF_value && price < maLTF_value &&
                       maLTFPrev_value < close_Price;
        signals.closeBuy = price <= maLTF_value;
        signals.closeSell = price >= maLTF_value;

        return signals;
    }

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        TradingSignals signals = EvaluateTradingSignals(baseValues, price);

        tradeCustom.UpdateSLUpDownValue(price, maLTF_value, currentLow, currentHigh,
                                        stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }
};

// Global pointer instance (allocated in OnInit, freed in OnDeinit)
HandleValues *g_handleValues = NULL;

// Lifecycle functions
int OnInit()
{

    trade.SetExpertMagicNumber(MagicNumber); // Gán Magic Number cho EA

    maHTF_handle = iMA(_Symbol, SelectedTimeframeHTF, maHTF_period, 0, maHTF_method, maHTF_price);
    maLTF_handle = iMA(_Symbol, SelectedTimeframeLTF, maLTF_period, 0, maLTF_method, maLTF_price);

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();
    Sleep(1000);
    tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, maLTF_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframeLTF);

    return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
    if (maHTF_handle != INVALID_HANDLE)
        IndicatorRelease(maHTF_handle);
    if (maLTF_handle != INVALID_HANDLE)
        IndicatorRelease(maLTF_handle);
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
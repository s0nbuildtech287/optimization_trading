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
enum StopLossMethod
{
    SL_PRICE,      // Price
    SL_CHANDELIER, // Chandelier Line
};
// Inputs
input double lotThreshold = 0;                         // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                        // Magic number for the EA
input double riskMoney = 100;                          // Risk Money
input bool AcceptBuy = true;                           // Enable Buy Orders
input bool AcceptSell = false;                         // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;   // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;     // Order Entry Mode
input int MaPeriod = 200;                              // MA period
input ENUM_MA_METHOD MaMethod = MODE_SMA;              // MA method
input ENUM_APPLIED_PRICE MaAppliedPrice = PRICE_CLOSE; // MA applied price

// Chandelier Exit parameters (thay cho Heikin Ashi)
input int CE_Period = 22;         // CE period (ATR & Extremums)
input double CE_Multiplier = 3.0; // CE ATR multiplier
input bool CE_UseClose = true;    // CE Use Close Price for Extremums

input StopLossMethod StopLossOption = SL_PRICE;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int maHandle;
int ce_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double ma;
    double ma_prev;
    double adx_main;
    double ce_long;  // Chandelier Long Stop
    double ce_short; // Chandelier Short Stop
    int ce_dir;      // Chandelier Direction (1: Up, -1: Down)
    double close_prev;
    double ce_dirPrev;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(ce_dir, 0, currentLow, currentHigh, stoploss, highestPriceDuringGreen, lowestPriceDuringRed);

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        double ce_longBuffer[], ce_shortBuffer[], ce_up_arrowBuffer[], ce_down_arrowBuffer[];
        double maBuffer[];
        CopyBuffer(maHandle, 0, shift, 1, maBuffer);
        CopyBuffer(ce_handle, 0, shift, 2, ce_longBuffer);
        CopyBuffer(ce_handle, 1, shift, 2, ce_shortBuffer);
        CopyBuffer(ce_handle, 2, shift, 1, ce_up_arrowBuffer);
        CopyBuffer(ce_handle, 3, shift, 1, ce_down_arrowBuffer);

        ce_long = ce_longBuffer[1];
        ce_short = ce_shortBuffer[1];
        ce_dirPrev = (ce_longBuffer[0] != EMPTY_VALUE) ? 1 : (ce_shortBuffer[0] != EMPTY_VALUE) ? -1
                                                                                                : 0;
        ce_dir = (ce_longBuffer[1] != EMPTY_VALUE) ? 1 : (ce_shortBuffer[1] != EMPTY_VALUE) ? -1
                                                                                            : 0;
        close_prev = iClose(_Symbol, SelectedTimeframe, shift + 1);
        ma = maBuffer[0];

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};
        signals.buy = price > ma && ce_dir == 1 && ce_dirPrev != 1;
        signals.sell = price < ma && ce_dir == -1 && ce_dirPrev == 1;
        signals.closeBuy = ce_dir == -1;
        signals.closeSell = ce_dir == 1;
        return signals;
    }
    void CalculatePriceExtremesBasedOnCeDir(int shift)
    {
        int barsToCheck = 100;

        for (int i = barsToCheck; i > 0; i--)
        {
            int s = i + shift;
            double currentLow = iLow(_Symbol, SelectedTimeframe, s);
            double currentHigh = iHigh(_Symbol, SelectedTimeframe, s);
            double ce_long_buffer[], ce_short_buffer[];
            if (CopyBuffer(ce_handle, 0, s, 1, ce_long_buffer) <= 0 ||
                CopyBuffer(ce_handle, 1, s, 1, ce_short_buffer) <= 0)
            {
                Print("Failed to copy CE buffers at shift: ", s);
                continue;
            }
            ce_dir = (ce_long_buffer[0] != EMPTY_VALUE) ? 1 : (ce_short_buffer[0] != EMPTY_VALUE) ? -1
                                                                                                  : 0;
            if (ce_dir < 0) // Downtrend - track lowest
            {
                if (lowestPriceDuringRed == 0.0 || currentLow < lowestPriceDuringRed)
                    lowestPriceDuringRed = currentLow;
                if (highestPriceDuringGreen != 0.0)
                    highestPriceDuringGreen = 0.0;
            }
            else if (ce_dir > 0) // Uptrend - track highest
            {
                if (highestPriceDuringGreen == 0.0 || currentHigh > highestPriceDuringGreen)
                    highestPriceDuringGreen = currentHigh;
                if (lowestPriceDuringRed != 0.0)
                    lowestPriceDuringRed = 0.0;
            }
        }
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
    maHandle = iMA(_Symbol, SelectedTimeframe, MaPeriod, 0, MaMethod, MaAppliedPrice);
    ce_handle = iCustom(_Symbol, SelectedTimeframe, "ChandelierExit", CE_Period, CE_Multiplier, CE_UseClose);

    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000);
    g_handleValues.CalculatePriceExtremesBasedOnCeDir(shift);

    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (maHandle != INVALID_HANDLE)
        IndicatorRelease(maHandle);
    if (ce_handle != INVALID_HANDLE)
        IndicatorRelease(ce_handle);

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
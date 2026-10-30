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
input string S1 = "||======== MA1 Indicator Setting ========||";
input int MA1_Period = 5;
input ENUM_MA_METHOD MA1_Method = MODE_EMA;

input string S2 = "||======== MA2 Indicator Setting ========||";
input int MA2_Period = 10;
input ENUM_MA_METHOD MA2_Method = MODE_EMA;

input string S3 = "||======== MA3 Indicator Setting ========||";
input int MA3_Period = 15;
input ENUM_MA_METHOD MA3_Method = MODE_EMA;

input string S4 = "||======== MA4 Indicator Setting ========||";
input int MA4_Period = 20;
input ENUM_MA_METHOD MA4_Method = MODE_EMA;

input string S5 = "||======== MA5 Indicator Setting ========||";
input int MA5_Period = 25;
input ENUM_MA_METHOD MA5_Method = MODE_EMA;

input string S6 = "||======== MA6 Indicator Setting ========||";
input int MA6_Period = 30;
input ENUM_MA_METHOD MA6_Method = MODE_EMA;

input string S7 = "||======== MA7 Indicator Setting ========||";
input int MA7_Period = 35;
input ENUM_MA_METHOD MA7_Method = MODE_EMA;

input string S8 = "||======== MA8 Indicator Setting ========||";
input int MA8_Period = 40;
input ENUM_MA_METHOD MA8_Method = MODE_EMA;

input string S9 = "||======== MA9 Indicator Setting ========||";
input int MA9_Period = 45;
input ENUM_MA_METHOD MA9_Method = MODE_EMA;

input string S10 = "||======== MA10 Indicator Setting ========||";
input int MA10_Period = 50;
input ENUM_MA_METHOD MA10_Method = MODE_EMA;

input string S11 = "||======== MA11 Indicator Setting ========||";
input int MA11_Period = 55;
input ENUM_MA_METHOD MA11_Method = MODE_EMA;

input string S12 = "||======== MA12 Indicator Setting ========||";
input int MA12_Period = 60;
input ENUM_MA_METHOD MA12_Method = MODE_EMA;

input string S13 = "||======== MA13 Indicator Setting ========||";
input int MA13_Period = 65;
input ENUM_MA_METHOD MA13_Method = MODE_EMA;

input string S14 = "||======== MA14 Indicator Setting ========||";
input int MA14_Period = 70;
input ENUM_MA_METHOD MA14_Method = MODE_EMA;

input string S15 = "||======== MA15 Indicator Setting ========||";
input int MA15_Period = 75;
input ENUM_MA_METHOD MA15_Method = MODE_EMA;

input string S16 = "||======== MA16 Indicator Setting ========||";
input int MA16_Period = 80;
input ENUM_MA_METHOD MA16_Method = MODE_EMA;
input string S17 = "||======== MA17 Indicator Setting ========||";
input int MA17_Period = 85;
input ENUM_MA_METHOD MA17_Method = MODE_EMA;

input string S18 = "||======== MA18 Indicator Setting ========||";
input int MA18_Period = 90;
input ENUM_MA_METHOD MA18_Method = MODE_EMA;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int MA1_Handle;
int MA2_Handle;
int MA3_Handle;
int MA4_Handle;
int MA5_Handle;
int MA6_Handle;
int MA7_Handle, MA8_Handle, MA9_Handle, MA10_Handle, MA11_Handle, MA12_Handle, MA13_Handle, MA14_Handle, MA15_Handle, MA16_Handle, MA17_Handle, MA18_Handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double MA1;
    double MA1Prev;
    double MA2;
    double MA3;
    double MA4;
    double MA5;
    double MA6;
    double MA7;
    double MA8;
    double MA9;
    double MA10;
    double MA11;
    double MA12;
    double MA13;
    double MA14;
    double MA15;
    double MA16;
    double MA17;
    double MA18;
    double pricePrev;
    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        tradeCustom.UpdateSLUpDownValue(price, MA1, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        if (MA1_Handle == INVALID_HANDLE || MA2_Handle == INVALID_HANDLE || MA3_Handle == INVALID_HANDLE || MA4_Handle == INVALID_HANDLE || MA5_Handle == INVALID_HANDLE || MA6_Handle == INVALID_HANDLE || MA7_Handle == INVALID_HANDLE || MA8_Handle == INVALID_HANDLE || MA9_Handle == INVALID_HANDLE || MA10_Handle == INVALID_HANDLE || MA11_Handle == INVALID_HANDLE || MA12_Handle == INVALID_HANDLE || MA13_Handle == INVALID_HANDLE || MA14_Handle == INVALID_HANDLE || MA15_Handle == INVALID_HANDLE || MA16_Handle == INVALID_HANDLE || MA17_Handle == INVALID_HANDLE || MA18_Handle == INVALID_HANDLE)
        {
            Print("Failed to load indicator handles!");
            return NULL;
        }
        double MA1_Buffer[], MA2_Buffer[], MA3_Buffer[], MA4_Buffer[], MA5_Buffer[], MA6_Buffer[], MA7_Buffer[], MA8_Buffer[], MA9_Buffer[], MA10_Buffer[], MA11_Buffer[], MA12_Buffer[], MA13_Buffer[], MA14_Buffer[], MA15_Buffer[], MA16_Buffer[], MA17_Buffer[], MA18_Buffer[];
        double copiedMA1 = CopyBuffer(MA1_Handle, 0, shift, 2, MA1_Buffer);
        double copiedMA2 = CopyBuffer(MA2_Handle, 0, shift, 1, MA2_Buffer);
        double copiedMA3 = CopyBuffer(MA3_Handle, 0, shift, 1, MA3_Buffer);
        double copiedMA4 = CopyBuffer(MA4_Handle, 0, shift, 1, MA4_Buffer);
        double copiedMA5 = CopyBuffer(MA5_Handle, 0, shift, 1, MA5_Buffer);
        double copiedMA6 = CopyBuffer(MA6_Handle, 0, shift, 1, MA6_Buffer);
        double copiedMA7 = CopyBuffer(MA7_Handle, 0, shift, 1, MA7_Buffer);
        double copiedMA8 = CopyBuffer(MA8_Handle, 0, shift, 1, MA8_Buffer);
        double copiedMA9 = CopyBuffer(MA9_Handle, 0, shift, 1, MA9_Buffer);
        double copiedMA10 = CopyBuffer(MA10_Handle, 0, shift, 1, MA10_Buffer);
        double copiedMA11 = CopyBuffer(MA11_Handle, 0, shift, 1, MA11_Buffer);
        double copiedMA12 = CopyBuffer(MA12_Handle, 0, shift, 1, MA12_Buffer);
        double copiedMA13 = CopyBuffer(MA13_Handle, 0, shift, 1, MA13_Buffer);
        double copiedMA14 = CopyBuffer(MA14_Handle, 0, shift, 1, MA14_Buffer);
        double copiedMA15 = CopyBuffer(MA15_Handle, 0, shift, 1, MA15_Buffer);
        double copiedMA16 = CopyBuffer(MA16_Handle, 0, shift, 1, MA16_Buffer);
        double copiedMA17 = CopyBuffer(MA17_Handle, 0, shift, 1, MA17_Buffer);
        double copiedMA18 = CopyBuffer(MA18_Handle, 0, shift, 1, MA18_Buffer);
        if (copiedMA1 <= 0 || copiedMA2 <= 0 || copiedMA3 <= 0 || copiedMA4 <= 0 || copiedMA5 <= 0 || copiedMA6 <= 0 || copiedMA7 <= 0 || copiedMA8 <= 0 || copiedMA9 <= 0 || copiedMA10 <= 0 || copiedMA11 <= 0 || copiedMA12 <= 0 || copiedMA13 <= 0 || copiedMA14 <= 0 || copiedMA15 <= 0 || copiedMA16 <= 0 || copiedMA17 <= 0 || copiedMA18 <= 0)
        {
            Print("Failed to copy indicator buffers!");
            return NULL;
        }
        MA1 = MA1_Buffer[1];
        MA1Prev = MA1_Buffer[0];
        MA2 = MA2_Buffer[0];
        MA3 = MA3_Buffer[0];
        MA4 = MA4_Buffer[0];
        MA5 = MA5_Buffer[0];
        MA6 = MA6_Buffer[0];
        MA7 = MA7_Buffer[0];
        MA8 = MA8_Buffer[0];
        MA9 = MA9_Buffer[0];
        MA10 = MA10_Buffer[0];
        MA11 = MA11_Buffer[0];
        MA12 = MA12_Buffer[0];
        MA13 = MA13_Buffer[0];
        MA14 = MA14_Buffer[0];
        MA15 = MA15_Buffer[0];
        MA16 = MA16_Buffer[0];
        MA17 = MA17_Buffer[0];
        MA18 = MA18_Buffer[0];
        pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);
        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = MA1 > MA2 && MA1 > MA3 && MA1 > MA4 &&
                      MA1 > MA5 && MA1 > MA6 && MA1 > MA7 &&
                      MA1 > MA8 && MA1 > MA9 && MA1 > MA10 &&
                      MA1 > MA11 && MA1 > MA12 && MA1 > MA13 &&
                      MA1 > MA14 && MA1 > MA15 && MA1 > MA16 &&
                      MA1 > MA17 && MA1 > MA18 && price > MA1 && pricePrev < MA1Prev;
        signals.sell = MA1 < MA2 && MA1 < MA3 && MA1 < MA4 &&
                       MA1 < MA5 && MA1 < MA6 && MA1 < MA7 &&
                       MA1 < MA8 && MA1 < MA9 && MA1 < MA10 &&
                       MA1 < MA11 && MA1 < MA12 && MA1 < MA13 &&
                       MA1 < MA14 && MA1 < MA15 && MA1 < MA16 &&
                       MA1 < MA17 && MA1 < MA18 && price < MA1 && pricePrev > MA1Prev;
        signals.closeBuy = price <= MA1;
        signals.closeSell = price >= MA1;

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
    MA1_Handle = iMA(_Symbol, SelectedTimeframe, MA1_Period, 0, MA1_Method, PRICE_CLOSE);
    MA2_Handle = iMA(_Symbol, SelectedTimeframe, MA2_Period, 0, MA2_Method, PRICE_CLOSE);
    MA3_Handle = iMA(_Symbol, SelectedTimeframe, MA3_Period, 0, MA3_Method, PRICE_CLOSE);
    MA4_Handle = iMA(_Symbol, SelectedTimeframe, MA4_Period, 0, MA4_Method, PRICE_CLOSE);
    MA5_Handle = iMA(_Symbol, SelectedTimeframe, MA5_Period, 0, MA5_Method, PRICE_CLOSE);
    MA6_Handle = iMA(_Symbol, SelectedTimeframe, MA6_Period, 0, MA6_Method, PRICE_CLOSE);
    MA7_Handle = iMA(_Symbol, SelectedTimeframe, MA7_Period, 0, MA7_Method, PRICE_CLOSE);
    MA8_Handle = iMA(_Symbol, SelectedTimeframe, MA8_Period, 0, MA8_Method, PRICE_CLOSE);
    MA9_Handle = iMA(_Symbol, SelectedTimeframe, MA9_Period, 0, MA9_Method, PRICE_CLOSE);
    MA10_Handle = iMA(_Symbol, SelectedTimeframe, MA10_Period, 0, MA10_Method, PRICE_CLOSE);
    MA11_Handle = iMA(_Symbol, SelectedTimeframe, MA11_Period, 0, MA11_Method, PRICE_CLOSE);
    MA12_Handle = iMA(_Symbol, SelectedTimeframe, MA12_Period, 0, MA12_Method, PRICE_CLOSE);
    MA13_Handle = iMA(_Symbol, SelectedTimeframe, MA13_Period, 0, MA13_Method, PRICE_CLOSE);
    MA14_Handle = iMA(_Symbol, SelectedTimeframe, MA14_Period, 0, MA14_Method, PRICE_CLOSE);
    MA15_Handle = iMA(_Symbol, SelectedTimeframe, MA15_Period, 0, MA15_Method, PRICE_CLOSE);
    MA16_Handle = iMA(_Symbol, SelectedTimeframe, MA16_Period, 0, MA16_Method, PRICE_CLOSE);
    MA17_Handle = iMA(_Symbol, SelectedTimeframe, MA17_Period, 0, MA17_Method, PRICE_CLOSE);
    MA18_Handle = iMA(_Symbol, SelectedTimeframe, MA18_Period, 0, MA18_Method, PRICE_CLOSE);
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(100); // Wait for the indicator handles to be created
    tradeCustom.CalculatePreviousLowestAndHighest(shift, MA10_Handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    IndicatorRelease(MA1_Handle);
    IndicatorRelease(MA2_Handle);
    IndicatorRelease(MA3_Handle);
    IndicatorRelease(MA4_Handle);
    IndicatorRelease(MA5_Handle);
    IndicatorRelease(MA6_Handle);
    IndicatorRelease(MA7_Handle);
    IndicatorRelease(MA8_Handle);
    IndicatorRelease(MA9_Handle);
    IndicatorRelease(MA10_Handle);
    IndicatorRelease(MA11_Handle);
    IndicatorRelease(MA12_Handle);
    IndicatorRelease(MA13_Handle);
    IndicatorRelease(MA14_Handle);
    IndicatorRelease(MA15_Handle);
    IndicatorRelease(MA16_Handle);
    IndicatorRelease(MA17_Handle);
    IndicatorRelease(MA18_Handle);
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
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
input ENUM_MA_METHOD MA_MODE = MODE_SMA;             // MA method
ENUM_APPLIED_PRICE MA_PRICE = PRICE_CLOSE;           // MA price
input int MAPeriod = 100;                            // MA period
input int MAShift = 0;                               // MA shift
input int CMFPeriod = 20;                            // CMF period
input int cmfLevel = 0;                              // CMF level
input int kijun_sen = 26;                            // Kijun-Sen period
int tenkan_sen = 9;                                  // Tenkan-sen period
int senkou_span_b = 52;                              // SenkouB period
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int maHandle;
int cmfHandle;
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
    double maValue;      // Moving Average value
    double maValuePrev;  // Previous Moving Average value
    double cmfValue;     // Chaikin Money Flow value
    double kijunSen;     // Kijun-Sen value
    double kijunSenPrev; // Kijun-Sen value
    double pricePrev;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);

        tradeCustom.UpdateSLUpDownValue(price, kijunSen, currentLow, currentHigh, stoploss,
                                        lowestPriceDuringRed, highestPriceDuringGreen);

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        double maBuffer[];
        if (CopyBuffer(maHandle, 0, shift, 2, maBuffer) == 2)
        {
            maValue = maBuffer[1];
            maValuePrev = maBuffer[0];
        }

        double cmfBuffer[];
        if (CopyBuffer(cmfHandle, 0, shift, 1, cmfBuffer) == 1)
        {
            cmfValue = cmfBuffer[0];
        }

        double kijunBuffer[];
        if (CopyBuffer(ichimokuHandle, 1, shift, 2, kijunBuffer) == 2)
        {
            kijunSen = kijunBuffer[1];
            kijunSenPrev = kijunBuffer[0];
        }
        pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};
        signals.buy = price > maValue && cmfValue > cmfLevel && price > kijunSen && pricePrev < kijunSenPrev;
        signals.sell = price < maValue && cmfValue < cmfLevel && price < kijunSen && pricePrev > kijunSenPrev;
        signals.closeBuy = price <= kijunSen;
        signals.closeSell = price >= kijunSen;
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
    maHandle = iMA(_Symbol, SelectedTimeframe, MAPeriod, MAShift, MA_MODE, MA_PRICE);
    cmfHandle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Chaikin_Money_Flow", CMFPeriod);
    ichimokuHandle = iIchimoku(_Symbol, SelectedTimeframe, tenkan_sen, kijun_sen, senkou_span_b);
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000); // Đợi một chút để đảm bảo các indicator đã sẵn sàng
    tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, ichimokuHandle, 1, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (maHandle != INVALID_HANDLE)
        IndicatorRelease(maHandle);
    if (cmfHandle != INVALID_HANDLE)
        IndicatorRelease(cmfHandle);
    if (ichimokuHandle != INVALID_HANDLE)
        IndicatorRelease(ichimokuHandle);

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
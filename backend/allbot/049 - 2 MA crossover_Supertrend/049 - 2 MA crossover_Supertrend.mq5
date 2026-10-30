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
enum StoplossOption
{

    SL_SUPER, // Supertrend
    SL_PRICE, // Lowest/Hightest price
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int SuperPeriod = 14;                          // Supertrend period
input double SuperMultiplier = 3.0;                  // Supertrend multiplier

input ENUM_MA_METHOD ma1_method = MODE_SMA;         // MA fast Method
input int InpMaFastPeriod = 20;                     // MA fast Period
input ENUM_APPLIED_PRICE MA1_Apply = PRICE_TYPICAL; // MA fast Apply To

input ENUM_MA_METHOD ma2_method = MODE_SMA;         // MA slow Method
input int InpMaSlowPeriod = 50;                     // MA slow Period
input ENUM_APPLIED_PRICE MA2_Apply = PRICE_TYPICAL; // MA slow Apply To

input StoplossOption StoplossOptions = SL_SUPER; // Stoploss option
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ma_handle_fast;
int ma_handle_slow;
int super_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double mafastValue;
    double maslowValue;
    double superValue;
    double superValuePrev;
    double superSL;

    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        switch (StoplossOptions)
        {
        case SL_SUPER:
            stoploss = superSL;
            break;
        case SL_PRICE:
            tradeCustom.UpdateSLUpDownValue(0.5, superValue, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);
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
        if (ma_handle_fast == INVALID_HANDLE || super_handle == INVALID_HANDLE || ma_handle_slow == INVALID_HANDLE)
            return NULL;
        double maFast_buffer[], super_buffer[], maSlow_buffer[], superSl_buffer[];
        int copiedTsiFast = CopyBuffer(ma_handle_fast, 0, shift, 1, maFast_buffer);
        int copiedTsiSlow = CopyBuffer(ma_handle_slow, 0, shift, 1, maSlow_buffer);
        int copiedSuperTrend = CopyBuffer(super_handle, 3, shift, 2, super_buffer);
        int copiedSuperSl = CopyBuffer(super_handle, 2, shift, 1, superSl_buffer);
        if (copiedTsiFast <= 0 || copiedTsiSlow <= 0 || copiedSuperTrend <= 0)
        {
            return NULL;
        }
        mafastValue = maFast_buffer[0];
        maslowValue = maSlow_buffer[0];
        superValue = super_buffer[1];
        superValuePrev = super_buffer[0];
        superSL = superSl_buffer[0];
        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = mafastValue > maslowValue && superValue == 0.0 && superValuePrev == 1.0 && price > mafastValue;
        signals.sell = mafastValue < maslowValue && superValue == 1.0 && superValuePrev == 0.0 && price < mafastValue;
        signals.closeBuy = superValue == 1.0;
        signals.closeSell = superValue == 0.0;
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
    ma_handle_fast = iMA(_Symbol, SelectedTimeframe, InpMaFastPeriod, 0, ma1_method, MA1_Apply);
    ma_handle_slow = iMA(_Symbol, SelectedTimeframe, InpMaSlowPeriod, 0, ma2_method, MA2_Apply);
    super_handle = iCustom(_Symbol, SelectedTimeframe, "supertrend_049", SuperPeriod, SuperMultiplier, false);
    if (g_handleValues == NULL)
        g_handleValues = new HandleValues();

    int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
    Sleep(1000);
    tradeCustom.CalculatePreviousLowestAndHighestValue(shift, super_handle, 3, 0.5, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

    return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
    if (ma_handle_fast != INVALID_HANDLE)
        IndicatorRelease(ma_handle_fast);
    if (ma_handle_slow != INVALID_HANDLE)
        IndicatorRelease(ma_handle_slow);
    if (super_handle != INVALID_HANDLE)
        IndicatorRelease(super_handle);

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
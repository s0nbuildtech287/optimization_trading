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
enum StoplossBuySource
{
    STOPLOSS_BUY_VWAP,        // VWAP
    STOPLOSS_BUY_MID_KELTNER, // Mid Keltner
    STOPLOSS_BUY_LOW_KELTNER  // Lower Keltner
};

enum StoplossSellSource
{
    STOPLOSS_SELL_VWAP,        // VWAP
    STOPLOSS_SELL_MID_KELTNER, // Mid Keltner
    STOPLOSS_SELL_UP_KELTNER   // Upper Keltner
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int Keltner_EMAPeriod = 20;                    // Keltner EMA period (mid-line)
input int Keltner_ATRPeriod = 10;                    // Keltner ATR period
input double Keltner_ATRMultiplier = 2.0;            // Keltner ATR Multiplier
//+------------------------------------------------------------------+
//| Input Parameters for VWAP                         |
//+------------------------------------------------------------------+
input int VWAP_Period = 20;                                       // VWAP Period
input StoplossBuySource StoplossBuyChoice = STOPLOSS_BUY_VWAP;    // SL mode for Buy
input StoplossSellSource StoplossSellChoice = STOPLOSS_SELL_VWAP; // SL mode for Sell
ENUM_APPLIED_PRICE VWAP_PriceSource = PRICE_CLOSE;
bool VWAP_UseRealVolume = false;
bool VWAP_SampleCorrection = false;
double VWAP_FirstDeviation = 1.0;
double VWAP_SecondDeviation = 2.0;
double VWAP_ThirdDeviation = 2.5;
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int handleVWAP;
int handleKeltner;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
    double ApplyBuy;
    double ApplySell;
    // Indicator values
    double vwapValue;
    double keltnerMid;
    double keltnerMidPrev;
    double keltnerUpper;
    double keltnerLower;
    double pricePrev;
    // Variables for tracking price extremes

    void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
    {
        HandleValuesBase *baseValues = GetIndicatorValues(shift);
        HandleValues *handleValues = (HandleValues *)baseValues;

        TradingSignals signals = EvaluateTradingSignals(handleValues, price);
        if (signals.buy && AcceptBuy)
        {
            switch (StoplossBuyChoice)
            {
            case STOPLOSS_BUY_VWAP:
                stoploss = vwapValue;
                break;
            case STOPLOSS_BUY_MID_KELTNER:
                stoploss = keltnerMid;
                break;
            case STOPLOSS_BUY_LOW_KELTNER:
                stoploss = keltnerLower;
                break;
            default:
                stoploss = vwapValue;
            }
        }
        if (signals.sell && AcceptSell)
        {
            switch (StoplossSellChoice)
            {
            case STOPLOSS_SELL_VWAP:
                stoploss = vwapValue;
                break;
            case STOPLOSS_SELL_MID_KELTNER:
                stoploss = keltnerMid;
                break;
            case STOPLOSS_SELL_UP_KELTNER:
                stoploss = keltnerUpper;
                break;
            default:
                stoploss = vwapValue;
            }
        }

        ApplyBuy = signals.buy && !signals.closeBuy;
        ApplySell = signals.sell && !signals.closeSell;
        tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
        tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
    }

    HandleValuesBase *GetIndicatorValues(int shift) override
    {
        double vwapBuffer[];
        double keltnerMidBuffer[];
        double keltnerUpperBuffer[];
        double keltnerLowerBuffer[];
        CopyBuffer(handleKeltner, 0, shift, 1, keltnerUpperBuffer);
        CopyBuffer(handleKeltner, 1, shift, 2, keltnerMidBuffer);
        CopyBuffer(handleKeltner, 2, shift, 1, keltnerLowerBuffer);
        CopyBuffer(handleVWAP, 3, shift, 1, vwapBuffer);
        vwapValue = vwapBuffer[0];
        keltnerMid = keltnerMidBuffer[1];
        keltnerMidPrev = keltnerMidBuffer[0];
        keltnerUpper = keltnerUpperBuffer[0];
        keltnerLower = keltnerLowerBuffer[0];
        pricePrev = iClose(_Symbol, _Period, shift + 1);

        return GetPointer(this);
    }

    TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
    {
        TradingSignals signals = {false, false, false, false};

        signals.buy = price > vwapValue && price > keltnerMid && pricePrev < keltnerMidPrev;
        signals.sell = price < vwapValue && price < keltnerMid && pricePrev > keltnerMidPrev;
        signals.closeBuy = price <= keltnerMid;
        signals.closeSell = price >= keltnerMid;

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
    handleVWAP = iCustom(_Symbol, _Period, "\\Indicators\\vwap_bands.ex5", VWAP_Period, VWAP_PriceSource, VWAP_UseRealVolume,
                         VWAP_SampleCorrection, VWAP_FirstDeviation, VWAP_SecondDeviation, VWAP_ThirdDeviation);
    handleKeltner = iCustom(_Symbol, _Period, "\\Indicators\\Free Indicators\\Keltner Channel.ex5", Keltner_EMAPeriod,
                            Keltner_ATRPeriod, Keltner_ATRMultiplier, false);
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
    if (handleVWAP != INVALID_HANDLE)
        IndicatorRelease(handleVWAP);
    if (handleKeltner != INVALID_HANDLE)
        IndicatorRelease(handleKeltner);
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
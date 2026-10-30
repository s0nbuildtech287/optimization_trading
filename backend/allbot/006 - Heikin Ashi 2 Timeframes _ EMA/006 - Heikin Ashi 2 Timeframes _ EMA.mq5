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
input double lotThreshold = 0;                                               // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                                              // Magic number for the EA
input double riskMoney = 100;                                                // Risk Money
input bool AcceptBuy = true;                                                 // Enable Buy Orders
input bool AcceptSell = false;                                               // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;                         // Selected SelectedTimeframe for the EA
input ENUM_TIMEFRAMES SelectedTimeframeLtf = PERIOD_CURRENT;                 // Lower SelectedTimeframe
input ENUM_TIMEFRAMES SelectedTimeframeHtf = PERIOD_D1;                      // Higher SelectedTimeframe
input OrderEntryMode OrderEntryOption = ENTRY_ATO;                           // Order Entry Mode
input group "Buy Position Settings" input ENUM_MA_METHOD MaMode1 = MODE_EMA; // MA Method
input int MaPeriod1 = 9;                                                     // MA Period
input color MA1Color = clrOrange;                                            // MA Color
bool EnableMA1 = true;
input int Width_MA1 = 2;                                                      // Line Width for MA
input ENUM_APPLIED_PRICE AP1 = PRICE_CLOSE;                                   // Apply To Price
input double MatrB = 2;                                                       // ATR Multiplier
input int adrperiodB = 14;                                                    // ATR Period
input group "Sell Position Settings" input ENUM_MA_METHOD MaMode2 = MODE_EMA; // MA Method
input int MaPeriod2 = 21;                                                     // MA Period
input color MA2Color = clrWhite;                                              // MA Color
bool EnableMA2 = true;
input int Width_MA2 = 2;                    // Line Width for MA
input ENUM_APPLIED_PRICE AP2 = PRICE_CLOSE; // Apply To Price
input double MatrS = 2;                     // ATR Multiplier
input int adrperiodS = 14;                  // ATR Period

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int mvg, hk, mvg2, hk2, atr;
int atrB;
int atrS;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
  double ApplyBuy;
  double ApplySell;
  // Indicator values
  double heikinAshiLow_color;
  double heikinAshiHigh_color;
  double heikinAshiLowPrev_color;
  double smamvg;
  double smamvg2;
  double atrBValue;
  double atrSValue;

  // Variables for tracking price extremes

  void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
  {
    HandleValuesBase *baseValues = GetIndicatorValues(shift);
    HandleValues *handleValues = (HandleValues *)baseValues;

    TradingSignals signals = EvaluateTradingSignals(handleValues, price);
    if (signals.buy)
    {
      double Ask = NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_ASK), _Digits);

      stoploss = Ask - (atrBValue * MatrB);
    }
    else if (signals.sell)
    {
      double Bid = NormalizeDouble(SymbolInfoDouble(_Symbol, SYMBOL_BID), _Digits);
      stoploss = Bid + (atrSValue * MatrS);
    }

    ApplyBuy = signals.buy && !signals.closeBuy;
    ApplySell = signals.sell && !signals.closeSell;
    tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
    tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
  }

  HandleValuesBase *GetIndicatorValues(int shift) override
  {
    double heikinAshiLow_ar[];
    double heikinAshiHigh_ar[];
    double smamvg_ar[];
    double smamvg2_ar[];
    double atrB_ar[];
    double atrS_ar[];

    CopyBuffer(hk, 4, shift, 2, heikinAshiLow_ar);
    CopyBuffer(hk2, 4, shift, 1, heikinAshiHigh_ar);
    CopyBuffer(mvg, 0, shift, 1, smamvg_ar);
    CopyBuffer(mvg2, 0, shift, 1, smamvg2_ar);
    CopyBuffer(atrB, 0, shift, 1, atrB_ar);
    CopyBuffer(atrS, 0, shift, 1, atrS_ar);

    heikinAshiLow_color = heikinAshiLow_ar[1];
    heikinAshiHigh_color = heikinAshiHigh_ar[0];
    heikinAshiLowPrev_color = heikinAshiLow_ar[0];
    smamvg = smamvg_ar[0];
    smamvg2 = smamvg2_ar[0];
    atrBValue = atrB_ar[0];
    atrSValue = atrS_ar[0];
    return GetPointer(this);
  }

  TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
  {
    TradingSignals signals = {false, false, false, false};
    signals.buy = price > smamvg && heikinAshiLow_color == 0.0 && heikinAshiLowPrev_color == 1.0 && heikinAshiHigh_color == 0.0;
    signals.sell = price < smamvg && heikinAshiHigh_color == 1.0 && heikinAshiLow_color == 1.0 && heikinAshiLowPrev_color == 0.0;
    signals.closeBuy = heikinAshiLow_color == 1.0 || price < smamvg || heikinAshiHigh_color == 1.0;
    signals.closeSell = heikinAshiLow_color == 0.0 || price > smamvg || heikinAshiHigh_color == 0.0;

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
  mvg = iCustom(_Symbol, SelectedTimeframeLtf, "MultiMA.ex5", MaMode1, MaPeriod1, MA1Color, EnableMA1, Width_MA1, AP1, MaMode2, MaPeriod2, MA2Color, EnableMA2, Width_MA2, AP2);
  hk = iCustom(_Symbol, SelectedTimeframeLtf, "heinken_ashh");

  mvg2 = iCustom(_Symbol, SelectedTimeframeHtf, "MultiMA.ex5", MaMode1, MaPeriod1, MA1Color, EnableMA1, Width_MA1, AP1, MaMode2, MaPeriod2, MA2Color, EnableMA2, Width_MA2, AP2);
  hk2 = iCustom(_Symbol, SelectedTimeframeHtf, "heinken_ashh");
  atrB = iATR(_Symbol, SelectedTimeframeLtf, adrperiodB);
  atrS = iATR(_Symbol, SelectedTimeframeHtf, adrperiodS);
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
  if (mvg != INVALID_HANDLE)
    IndicatorRelease(mvg);
  if (mvg2 != INVALID_HANDLE)
    IndicatorRelease(mvg2);
  if (hk != INVALID_HANDLE)
    IndicatorRelease(hk);
  if (hk2 != INVALID_HANDLE)
    IndicatorRelease(hk2);
  if (atrB != INVALID_HANDLE)
    IndicatorRelease(atrB);
  if (atrS != INVALID_HANDLE)
    IndicatorRelease(atrS);

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
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
input double lotThreshold = 0;                          // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                         // Magic number for the EA
input double riskMoney = 100;                           // Risk Money
input bool AcceptBuy = true;                            // Enable Buy Orders
input bool AcceptSell = false;                          // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1;    // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;      // Order Entry Mode
input ENUM_TIMEFRAMES SelectedTimeframeLtf = PERIOD_H1; // Selected SelectedTimeframe for LTF
input ENUM_TIMEFRAMES SelectedTimeframeHtf = PERIOD_H4; // Selected SelectedTimeframe for HTF

datetime lastBarTime = iTime(_Symbol, SelectedTimeframe, 0);
input int InpMAPeriod = 20;                        // MA  Period
input ENUM_MA_METHOD ma_method = MODE_SMA;         // MA  Method
input ENUM_APPLIED_PRICE MA_Apply = PRICE_TYPICAL; // MA  Apply To
input int InpDonchianPeriodHTF = 10;               // Donchian HTF Period
input int InpDonchianPeriodLTF = 30;               // Donchian LTF Period
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ma_handle;
int donchian_handle_htf;
int donchian_handle_ltf;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double ma_value;
   double ma_valuePrev;
   double donchianUpperLTF;
   double donchianMidLTF;
   double donchianLowerLTF;
   double donchianMidHTF;
   double donchianUpperHTF;
   double donchianLowHTF;
   double closePrev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (signals.buy && AcceptBuy)
      {
         stoploss = donchianLowHTF;
      }
      if (signals.sell && AcceptSell)
      {
         stoploss = donchianUpperHTF;
      }

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (donchian_handle_htf == INVALID_HANDLE || donchian_handle_ltf == INVALID_HANDLE || ma_handle == INVALID_HANDLE)
      {
         Print("Error creating handle: ", GetLastError());
         return NULL;
      }
      double donchianUpperHTFBuffer[];
      double donchianMidHTFBuffer[];
      double donchianLowHTFBuffer[];
      double donchianLowerLTFBuffer[];
      double donchianMidLTFBuffer[];
      double donchianUpperLTFBuffer[];
      double maBuffer[];
      CopyBuffer(donchian_handle_htf, 0, shift, 1, donchianUpperHTFBuffer);
      CopyBuffer(donchian_handle_htf, 1, shift, 1, donchianMidHTFBuffer);
      CopyBuffer(donchian_handle_htf, 2, shift, 1, donchianLowHTFBuffer);
      CopyBuffer(donchian_handle_ltf, 0, shift, 1, donchianUpperLTFBuffer);
      CopyBuffer(donchian_handle_ltf, 1, shift, 1, donchianMidLTFBuffer);
      CopyBuffer(donchian_handle_ltf, 2, shift, 1, donchianLowerLTFBuffer);
      CopyBuffer(ma_handle, 0, shift, 2, maBuffer);

      donchianUpperHTF = donchianUpperHTFBuffer[0];
      donchianMidHTF = donchianMidHTFBuffer[0];
      donchianLowHTF = donchianLowHTFBuffer[0];
      donchianUpperLTF = donchianUpperLTFBuffer[0];
      donchianMidLTF = donchianMidLTFBuffer[0];
      donchianLowerLTF = donchianLowerLTFBuffer[0];
      ma_value = maBuffer[1];
      ma_valuePrev = maBuffer[0];
      closePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = price > ma_value && closePrev < ma_valuePrev && price > donchianUpperHTF;
      signals.sell = price < ma_value && closePrev > ma_valuePrev && price < donchianLowHTF;
      signals.closeBuy = price < donchianLowerLTF || price <= ma_value;
      signals.closeSell = price > donchianUpperLTF || price >= ma_value;
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

   donchian_handle_ltf = iCustom(_Symbol, SelectedTimeframeLtf, "Donchian_Channel_038", InpDonchianPeriodLTF, false, C'0,255,42', clrWhite, C'234,0,255');
   donchian_handle_htf = iCustom(_Symbol, SelectedTimeframeHtf, "Donchian_Channel_038", InpDonchianPeriodHTF, false, clrBlue, clrGray, clrDodgerBlue);
   ma_handle = iMA(_Symbol, SelectedTimeframe, InpMAPeriod, 0, ma_method, MA_Apply);
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
   if (donchian_handle_ltf != INVALID_HANDLE)
      IndicatorRelease(donchian_handle_ltf);
   if (donchian_handle_htf != INVALID_HANDLE)
      IndicatorRelease(donchian_handle_htf);
   if (ma_handle != INVALID_HANDLE)
      IndicatorRelease(ma_handle);

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
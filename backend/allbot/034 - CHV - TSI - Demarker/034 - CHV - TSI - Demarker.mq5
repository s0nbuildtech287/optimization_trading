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

input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int inpPeriod1 = 25;                           // True strength index momentum smoothing period for TSI
input int inpPeriod2 = 13;                           // True strength index smoothing period 2 for TSI
input ENUM_APPLIED_PRICE inpPrice = PRICE_CLOSE;     // Price for TSI calculation for TSI
input int InpSmoothPeriod = 10;                      // Smoothing period
input int InpCHVPeriod = 10;                         // CHV period
input ENUM_MA_METHOD InpSmoothType = MODE_EMA;       // Smoothing method
input int InpDeMarkerPeriod = 14;                    // DeMarker period for DeMarker indicator
input double demakerThreshold = 0.3;                 // Threshold for DeMarker indicator

double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;
int chv_handle = INVALID_HANDLE;
int tsi_handle = INVALID_HANDLE;
int demarker_handle = INVALID_HANDLE;

// Class for indicator values and trading signal evaluation
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator state
   double chv_value;
   double tsi_value;
   double tsiPrev_value;
   double demarker_value;

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      tradeCustom.UpdateSLUpDownValue(1.5, tsi_value, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (chv_handle == INVALID_HANDLE || tsi_handle == INVALID_HANDLE || demarker_handle == INVALID_HANDLE)
      {
         Print("Invalid indicator handles");
         return NULL;
      }

      double chvBuffer[];
      double tsiBuffer[];
      double demarkerBuffer[];

      if (CopyBuffer(chv_handle, 0, shift, 1, chvBuffer) <= 0 ||
          CopyBuffer(tsi_handle, 1, shift, 2, tsiBuffer) <= 0 ||
          CopyBuffer(demarker_handle, 0, shift, 1, demarkerBuffer) <= 0)
      {
         Print("Failed to copy indicator buffers");
         return NULL;
      }

      chv_value = chvBuffer[0];
      tsi_value = tsiBuffer[1];
      tsiPrev_value = tsiBuffer[0];
      demarker_value = demarkerBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = chv_value > 0 && tsi_value == 1.0 && tsiPrev_value == 2.0 && demarker_value > demakerThreshold;
      signals.sell = chv_value < 0 && tsi_value == 2.0 && tsiPrev_value == 1.0 && demarker_value < demakerThreshold;
      signals.closeBuy = tsi_value == 2.0;
      signals.closeSell = tsi_value == 1.0;
      return signals;
   }
};

// Global handle values pointer for EA lifecycle
HandleValues *g_handleValues = NULL;

int OnInit()
{

   trade.SetExpertMagicNumber(MagicNumber); // Gán Magic Number cho EA

   tsi_handle = iCustom(_Symbol, SelectedTimeframe, "TSI", inpPeriod1, inpPeriod2, inpPrice);
   chv_handle = iCustom(_Symbol, SelectedTimeframe, "Examples\\CHV", InpCHVPeriod, InpSmoothPeriod, InpSmoothType);
   demarker_handle = iDeMarker(_Symbol, SelectedTimeframe, InpDeMarkerPeriod);

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();
   Sleep(1000);
   tradeCustom.CalculatePreviousLowestAndHighestValue(shift, tsi_handle, 1, 1.5, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (tsi_handle != INVALID_HANDLE)
      IndicatorRelease(tsi_handle);
   if (chv_handle != INVALID_HANDLE)
      IndicatorRelease(chv_handle);
   if (demarker_handle != INVALID_HANDLE)
      IndicatorRelease(demarker_handle);
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
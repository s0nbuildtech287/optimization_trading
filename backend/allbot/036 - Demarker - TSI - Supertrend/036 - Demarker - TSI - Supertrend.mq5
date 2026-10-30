//+------------------------------------------------------------------+
//|                        Copyright 2025, LotusQuant                 |
//|                        https://LotusQuant.com                     |
//+------------------------------------------------------------------+
#property strict
#property copyright "Copyright 2025, LotusQuant"
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
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected Timeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int inpPeriod1 = 25;                           // True strength index momentum smoothing period for TSI
input int inpPeriod2 = 13;                           // True strength index smoothing period 2 for TSI
input ENUM_APPLIED_PRICE inpPrice = PRICE_CLOSE;     // Price for TSI calculation for TSI
input int Periode = 10;                              // Supertrend period
input double Multiplier = 3;                         // Supertrend multiplier
input int InpDeMarkerPeriod = 14;                    // DeMarker period for DeMarker indicator
input double demakerThreshold = 0.3;                 // Threshold for DeMarker indicator

// Runtime globals and indicator handles
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

int supertrend_handle = INVALID_HANDLE;
int tsi_handle = INVALID_HANDLE;
int demarker_handle = INVALID_HANDLE;

// Class definition
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator state members
   double supertrend_color;
   double supertrend_color_prev;
   double supertrend_value;
   double tsi_value;
   double demarker_value;
   double demarkerPrev_value;

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;
      TradingSignals signals = EvaluateTradingSignals(handleValues, price);

      tradeCustom.UpdateSLUpDownValue(price, supertrend_value, currentLow, currentHigh, stoploss, lowestPriceDuringRed, highestPriceDuringGreen);

      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (supertrend_handle == INVALID_HANDLE || tsi_handle == INVALID_HANDLE || demarker_handle == INVALID_HANDLE)
      {
         Print("Invalid indicator handles");
         return NULL;
      }

      double supertrendColorBuffer[];
      double supertrendValueBuffer[];
      double tsiBuffer[];
      double demarkerBuffer[];

      if (CopyBuffer(supertrend_handle, 3, shift, 2, supertrendColorBuffer) <= 0 ||
          CopyBuffer(tsi_handle, 1, shift, 1, tsiBuffer) <= 0 ||
          CopyBuffer(supertrend_handle, 2, shift, 1, supertrendValueBuffer) <= 0 ||
          CopyBuffer(demarker_handle, 0, shift, 2, demarkerBuffer) <= 0)
      {
         Print("Failed to copy indicator buffers");
         return NULL;
      }

      supertrend_color = supertrendColorBuffer[1];
      supertrend_color_prev = supertrendColorBuffer[0];
      tsi_value = tsiBuffer[0];
      demarker_value = demarkerBuffer[1];
      demarkerPrev_value = demarkerBuffer[0];
      supertrend_value = supertrendValueBuffer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};
      signals.buy = supertrend_color == 0.0 && supertrend_color_prev == 1.0 && tsi_value == 1.0 && demarker_value > demakerThreshold && demarkerPrev_value < demakerThreshold;
      signals.sell = supertrend_color == 1.0 && supertrend_color_prev == 0.0 && tsi_value == 2.0 && demarker_value < demakerThreshold && demarkerPrev_value > demakerThreshold;
      signals.closeBuy = supertrend_color == 1.0;
      signals.closeSell = supertrend_color == 0.0;
      return signals;
   }
};

// Global pointer instance for EA
HandleValues *g_handleValues = NULL;

// Lifecycle functions
int OnInit()
{

   trade.SetExpertMagicNumber(MagicNumber); // Gán Magic Number cho EA

   tsi_handle = iCustom(_Symbol, SelectedTimeframe, "TSI", inpPeriod1, inpPeriod2, inpPrice);
   demarker_handle = iDeMarker(_Symbol, SelectedTimeframe, InpDeMarkerPeriod);
   supertrend_handle = iCustom(_Symbol, SelectedTimeframe, "supertrend_036", Periode, Multiplier, false);

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();
   Sleep(1000);

   tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, supertrend_handle, 2, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   if (tsi_handle != INVALID_HANDLE)
      IndicatorRelease(tsi_handle);
   if (demarker_handle != INVALID_HANDLE)
      IndicatorRelease(demarker_handle);
   if (supertrend_handle != INVALID_HANDLE)
      IndicatorRelease(supertrend_handle);

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
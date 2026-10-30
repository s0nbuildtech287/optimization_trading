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
input int Chv_Trend = 0;                             // CHV Trend
input int Chv_SmoothPeriod = 10;                     // Smoothing period CHV
input int Chv_Period = 10;                           // CHV period
input ENUM_MA_METHOD Chv_MA_Method = MODE_EMA;       // CHV MA Method
input int DeM_Period = 14;                           // DeMarker period
input double DeM_Lower = 0.3;                        // DeMarker Lower
input double DeM_Upper = 0.7;                        // DeMarker Upper
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int chaikin_handle;
int demarker_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double chaikin_now;
   double chaikin_prev;
   double demarker_now;
   double demarker_prev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (signals.buy)
      {
         stoploss = FindExtremeBetweenDeMarkerCross(true, shift);
      }
      else if (signals.sell)
      {
         stoploss = FindExtremeBetweenDeMarkerCross(false, shift);
      }
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (chaikin_handle == INVALID_HANDLE || demarker_handle == INVALID_HANDLE)
      {
         Print("Loi: chua tao duoc chi bao!");
         return NULL;
      }

      double chv_buf[];
      double demarker_buf[];
      ArraySetAsSeries(chv_buf, true);
      ArraySetAsSeries(demarker_buf, true);

      int chv_copied = CopyBuffer(chaikin_handle, 0, shift, 2, chv_buf);
      int dem_copied = CopyBuffer(demarker_handle, 0, shift, 2, demarker_buf);
      if (chv_copied >= 2 && dem_copied >= 2)
      {
         chaikin_now = chv_buf[0];
         chaikin_prev = chv_buf[1];
         demarker_now = demarker_buf[0];
         demarker_prev = demarker_buf[1];
      }
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = chaikin_now > Chv_Trend && chaikin_prev < Chv_Trend && demarker_prev < DeM_Lower && demarker_now > DeM_Lower;
      signals.sell = chaikin_now < Chv_Trend && chaikin_prev > Chv_Trend && demarker_prev > DeM_Upper && demarker_now < DeM_Upper;
      signals.closeBuy = (demarker_now <= DeM_Upper) ||
                         chaikin_now <= Chv_Trend;
      signals.closeSell = (demarker_now >= DeM_Lower) ||
                          chaikin_now >= Chv_Trend;

      return signals;
   }
   double FindExtremeBetweenDeMarkerCross(bool isBuy, int shift, int lookback = 100)
   {
      int i = shift;
      double prevDeM, currDeM;
      double extremePrice = isBuy ? DBL_MAX : -DBL_MAX;
      bool foundFirstCross = false;

      while (i < shift + lookback)
      {
         prevDeM = GetBufferValDeM(i + 1);
         currDeM = GetBufferValDeM(i);
         if ((isBuy && prevDeM < DeM_Lower && currDeM >= DeM_Lower) ||
             (!isBuy && prevDeM > DeM_Upper && currDeM <= DeM_Upper))
         {
            foundFirstCross = true;
            break;
         }

         i++;
      }

      if (!foundFirstCross)
         return isBuy ? iLow(_Symbol, _Period, shift) : iHigh(_Symbol, _Period, shift);

      int regionStart = i;
      while (i < shift + lookback)
      {
         prevDeM = GetBufferValDeM(i + 1);
         currDeM = GetBufferValDeM(i);

         double low = iLow(_Symbol, _Period, i);
         double high = iHigh(_Symbol, _Period, i);

         if (isBuy)
         {
            extremePrice = MathMin(extremePrice, low);
            if (prevDeM >= DeM_Lower && currDeM < DeM_Lower)
               break;
         }
         else
         {
            extremePrice = MathMax(extremePrice, high);
            if (prevDeM <= DeM_Upper && currDeM > DeM_Upper)
               break;
         }
         i++;
      }

      return extremePrice;
   }
   double GetBufferValDeM(int shift)
   {
      double demarker_buf[];
      ArraySetAsSeries(demarker_buf, true);
      if (demarker_handle != INVALID_HANDLE && CopyBuffer(demarker_handle, 0, shift, 1, demarker_buf) == 1)
         return demarker_buf[0];
      return 0;
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
   chaikin_handle = iCustom(_Symbol, SelectedTimeframe, "\\Indicators\\Examples\\CHV.ex5", Chv_SmoothPeriod, Chv_Period, Chv_MA_Method);
   demarker_handle = iDeMarker(_Symbol, SelectedTimeframe, DeM_Period);
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
   if (chaikin_handle != INVALID_HANDLE)
      IndicatorRelease(chaikin_handle);
   if (demarker_handle != INVALID_HANDLE)
      IndicatorRelease(demarker_handle);

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
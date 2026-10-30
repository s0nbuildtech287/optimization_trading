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
enum ChoseSL
{
   SL_AT_ENVELOPES,  // SL at Envelopes(0)
   SL_AT_PeakTrough, // SL at Peak/Trough(1)
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int envelopes_Period = 14;                     // Envelopes Period
input double envelopes_Deviation = 0.1;              // Envelopes Deviation
int envelopes_Shift = 0;                             // Envelopes Shift
input ENUM_MA_METHOD envelopes_Method = MODE_SMA;    // Envelopes Method
ENUM_APPLIED_PRICE envelopes_Price = PRICE_CLOSE;    // Envelopes Price Type

input int demarker_Period = 14;      // DeMarker Period
input double DeMarkerStarting = 0.3; // DeMarker Starting level
input double DeMarkerEnding = 0.7;   // DeMarker Ending level

input int cci_Period = 14;                  // CCI Period
ENUM_APPLIED_PRICE cci_Price = PRICE_CLOSE; // CCI Price type
input int CCIBuyLevel = 100;                // CCI buy level
input int CCISellLevel = -100;              // CCI sell level

input ChoseSL ChoiceSl = SL_AT_ENVELOPES; // Choose SL method
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int envelopes_handle;
int demarker_handle;
int cci_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values
   double envelopesUpper;
   double envelopesUpperPrev;
   double envelopesLower;
   double envelopesLowerPrev;
   double demarkerCurrent;
   double demarkerPrevious;
   double cciCurrent;
   double cciPrevious;
   double pricePrev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (ChoiceSl)
      {
      case SL_AT_ENVELOPES:
         if (AcceptBuy)
         {
            stoploss = envelopesLower;
         }
         else if (AcceptSell)
         {
            stoploss = envelopesUpper;
         }
         break;
      case SL_AT_PeakTrough:
         tradeCustom.UpdateSLUpDownValue(price, handleValues.envelopesUpper, currentLow, currentHigh, stoploss,
                                         lowestPriceDuringRed, highestPriceDuringGreen);
         break;
      }
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (envelopes_handle == INVALID_HANDLE || demarker_handle == INVALID_HANDLE || cci_handle == INVALID_HANDLE)
      {
         Print("Lỗi: Không thể khởi tạo chỉ báo Envelopes, DeMarker hoặc CCI!");
         return NULL;
      }
      double envelopesUpperBuffer[], envelopesLowerBuffer[], demarkerBuffer[], cciBuffer[];

      int copiedUpper = CopyBuffer(envelopes_handle, 0, shift, 2, envelopesUpperBuffer);
      int copiedLower = CopyBuffer(envelopes_handle, 1, shift, 2, envelopesLowerBuffer);
      int copied2 = CopyBuffer(demarker_handle, 0, shift, 2, demarkerBuffer);
      int copied3 = CopyBuffer(cci_handle, 0, shift, 2, cciBuffer);
      envelopesUpper = envelopesUpperBuffer[1];
      envelopesLower = envelopesLowerBuffer[1];
      envelopesUpperPrev = envelopesUpperBuffer[0];
      envelopesLowerPrev = envelopesLowerBuffer[0];
      demarkerCurrent = demarkerBuffer[1];
      demarkerPrevious = demarkerBuffer[0];
      cciCurrent = cciBuffer[1];
      cciPrevious = cciBuffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = price > envelopesUpper && pricePrev < envelopesUpperPrev && demarkerCurrent > DeMarkerStarting && demarkerCurrent < DeMarkerEnding && cciCurrent > CCIBuyLevel;
      signals.sell = price < envelopesLower && pricePrev > envelopesLowerPrev && demarkerCurrent > DeMarkerStarting && demarkerCurrent < DeMarkerEnding && cciCurrent < CCISellLevel;
      signals.closeBuy = price <= envelopesUpper;
      signals.closeSell = price >= envelopesLower;

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
   envelopes_handle = iEnvelopes(_Symbol, SelectedTimeframe, envelopes_Period, envelopes_Shift, envelopes_Method, envelopes_Price, envelopes_Deviation);
   demarker_handle = iDeMarker(_Symbol, SelectedTimeframe, demarker_Period);
   cci_handle = iCCI(_Symbol, SelectedTimeframe, cci_Period, cci_Price);
   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, envelopes_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);

   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (envelopes_handle != INVALID_HANDLE)
      IndicatorRelease(envelopes_handle);
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
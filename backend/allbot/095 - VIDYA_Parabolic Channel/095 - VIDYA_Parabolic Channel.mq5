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
enum ChoiceSL
{
   SL_AT_PASR,  // SL at PSAR(0)
   SL_AT_VIDYA, // SL at VIDYA(1)
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int ema_Period = 9;                            // VIDYA - EMA Period
input int cmo_Period = 14;                           // VIDYA - CMO Period
input double stepPsar = 0.02;                        // Parabolic Channel - Step
input double maxPsar = 0.2;                          // Parabolic Channel - Maximum
input ChoiceSL choiceSL = SL_AT_PASR;                //  Stop Loss Choice
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int vidya_handle;
int psar_handle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double vidyaPrevious;
   double vidyaCurrent;
   double psaUpper;
   double psaLower;
   double psa;
   double pricePrev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      switch (choiceSL)
      {
      case SL_AT_PASR:
         stoploss = handleValues.psa;
         break;
      case SL_AT_VIDYA:
         stoploss = handleValues.vidyaCurrent;
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
      if (vidya_handle == INVALID_HANDLE || psar_handle == INVALID_HANDLE)
      {
         Print("Error creating VIDYA handle: ", GetLastError());
         return NULL;
      }

      double vidyaBuffer[];
      double psarUpperBuffer[];
      double psarLowerBuffer[];
      double psarBuffer[];
      int copiedVidya = CopyBuffer(vidya_handle, 0, shift, 2, vidyaBuffer);
      int copiedPsar = CopyBuffer(psar_handle, 0, shift, 1, psarUpperBuffer);
      int copiedPsarLower = CopyBuffer(psar_handle, 2, shift, 1, psarLowerBuffer);
      int copiedPsarBuffer = CopyBuffer(psar_handle, 1, shift, 1, psarBuffer);
      vidyaCurrent = vidyaBuffer[1];
      vidyaPrevious = vidyaBuffer[0];
      psaUpper = psarUpperBuffer[0];
      psaLower = psarLowerBuffer[0];
      psa = psarBuffer[0];
      pricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);
      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = price > vidyaCurrent && price > psaUpper && pricePrev < vidyaPrevious;
      signals.sell = price < vidyaCurrent && price < psaLower && pricePrev > vidyaPrevious;
      signals.closeBuy = price <= vidyaCurrent;
      signals.closeSell = price >= vidyaCurrent;
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
   vidya_handle = iVIDyA(_Symbol, SelectedTimeframe, cmo_Period, ema_Period, 0, PRICE_CLOSE);
   psar_handle = iCustom(_Symbol, SelectedTimeframe, "Free Indicators//Parabolic Channel", stepPsar, maxPsar, false);
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
   if (vidya_handle != INVALID_HANDLE)
      IndicatorRelease(vidya_handle);
   if (psar_handle != INVALID_HANDLE)
      IndicatorRelease(psar_handle);

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
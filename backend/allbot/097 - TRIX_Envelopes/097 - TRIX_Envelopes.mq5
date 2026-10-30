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
input int envelopes_Period = 14;                        // Period for the Envelopes indicator
input double envelopes_Deviation = 0.1;                 // Deviation for the Envelopes indicator
input ENUM_MA_METHOD envelopes_Method = MODE_SMA;       // Method for the Envelopes indicator
input ENUM_APPLIED_PRICE envelopes_Price = PRICE_CLOSE; // Price type for the Envelopes indicator
input int trix_Period = 14;                             // Period for the TRIX indicator
input ENUM_APPLIED_PRICE trix_Price = PRICE_CLOSE;      // Price type for the TRIX indicator
// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int trix_handle;
int envelops_handle;

//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double trix_value;
   double envelopesUpperCurrent;
   double envelopesLowerCurrent;
   double envelopesUpperPrevious;
   double envelopesLowerPrevious;
   double PricePrev;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      tradeCustom.UpdateSLUpDownValue(price, envelopesUpperCurrent, currentLow, currentHigh, stoploss,
                                      lowestPriceDuringRed, highestPriceDuringGreen);
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (trix_handle == INVALID_HANDLE || envelops_handle == INVALID_HANDLE)
      {
         Print("Lỗi: Không thể khởi tạo chỉ báo TRIX hoặc Envelopes!");
         return NULL;
      }
      double trixBuffer[], envelopesUpperBuffer[], envelopesLowerBuffer[];
      int copied1 = CopyBuffer(trix_handle, 0, shift, 1, trixBuffer);
      int copied2 = CopyBuffer(envelops_handle, 0, shift, 2, envelopesUpperBuffer);
      int copied3 = CopyBuffer(envelops_handle, 1, shift, 2, envelopesLowerBuffer);
      trix_value = trixBuffer[0];
      envelopesUpperCurrent = envelopesUpperBuffer[1];
      envelopesLowerCurrent = envelopesLowerBuffer[1];
      envelopesUpperPrevious = envelopesUpperBuffer[0];
      envelopesLowerPrevious = envelopesLowerBuffer[0];
      PricePrev = iClose(_Symbol, SelectedTimeframe, shift + 1);

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = trix_value > 0 && envelopesUpperCurrent < price && envelopesUpperPrevious > PricePrev;
      signals.sell = trix_value < 0 && envelopesLowerCurrent > price && envelopesLowerPrevious < PricePrev;
      signals.closeBuy = envelopesUpperCurrent >= price;
      signals.closeSell = envelopesLowerCurrent <= price ;
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
   envelops_handle = iEnvelopes(_Symbol, SelectedTimeframe, envelopes_Period, 0, envelopes_Method, envelopes_Price, envelopes_Deviation);
   trix_handle = iTriX(_Symbol, SelectedTimeframe, trix_Period, trix_Price);

   if (g_handleValues == NULL)
      g_handleValues = new HandleValues();

   int shift = (OrderEntryOption == ENTRY_ATC) ? 0 : 1;
   Sleep(1000); // Đợi một chút để đảm bảo các indicator đã sẵn sàng
   tradeCustom.CalculatePreviousLowestAndHighestPrice(shift, envelops_handle, 0, lowestPriceDuringRed, highestPriceDuringGreen, SelectedTimeframe);
   return (INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                  |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   if (envelops_handle != INVALID_HANDLE)
      IndicatorRelease(envelops_handle);
   if (trix_handle != INVALID_HANDLE)
      IndicatorRelease(trix_handle);

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
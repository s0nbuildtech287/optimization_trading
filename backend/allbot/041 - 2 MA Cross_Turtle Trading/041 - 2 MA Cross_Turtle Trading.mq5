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
enum OptionStoplossBuy
{
   BUY_STOPLOSS_ATR = 1, // ATR-based stop loss
   BUY_STOPLOSS_BB = 2   //  Donchain Bands-based stop loss
};
enum OptionStoplossSell
{
   SELL_STOPLOSS_ATR = 1, // ATR-based stop loss
   SELL_STOPLOSS_BB = 2   // Donchain Bands-based stop loss
};
// Inputs
input double lotThreshold = 0;                       // Maximum lot size, 0 has no effect
input int MagicNumber = 123456;                      // Magic number for the EA
input double riskMoney = 100;                        // Risk Money
input bool AcceptBuy = true;                         // Enable Buy Orders
input bool AcceptSell = false;                       // Enable Sell Orders
input ENUM_TIMEFRAMES SelectedTimeframe = PERIOD_H1; // Selected SelectedTimeframe for the EA
input OrderEntryMode OrderEntryOption = ENTRY_ATO;   // Order Entry Mode
input int ATRPeriod = 14;                            // ATR Period for stop loss calculation
input double ATRFactor = 2;                          // ATR Factor for stop loss calculation
input ENUM_MA_METHOD ma1_method = MODE_SMA;          // MA fast Method
input int InpMA1Period = 20;                         // MA fast Period
input ENUM_APPLIED_PRICE MA1_Apply = PRICE_TYPICAL;  // MA fast Apply To
input ENUM_MA_METHOD ma2_method = MODE_SMA;          // MA Slow Method
input int InpMA2Period = 50;                         // MA Slow Period
input ENUM_APPLIED_PRICE MA2_Apply = PRICE_TYPICAL;  // MA Slow Apply To

input int InpDonchianPeriodLTF = 100; //  Donchian Entry Period

input int InpDonchianPeriodHTF = 20;                            // Donchian Exit Period
input OptionStoplossBuy stoplossBuyOption = BUY_STOPLOSS_BB;    // Stoploss option for buy orders
input OptionStoplossSell stoplossSellOption = SELL_STOPLOSS_BB; // Stoploss option for sell orders

// Runtime globals
double stoploss = 0.0;
double lowestPriceDuringRed = 0.0;
double highestPriceDuringGreen = 0.0;

// Indicator handles
int ma_handle_first;
int ma_handle_second;
int donchian_handle_htf;
int donchian_handle_ltf;
int ATRHandle;
//+------------------------------------------------------------------+
//|                    HandleValues class definition                  |
//+------------------------------------------------------------------+
class HandleValues : public HandleValuesBase
{
public:
   double ApplyBuy;
   double ApplySell;
   // Indicator values

   double ma_value_first;
   double ma_value_firstPrev;
   double ma_value_second;
   double ma_value_secondPrev;
   double donchianUpperLTF;
   double donchianMidLTF;
   double donchianLowerLTF;
   double donchianMidHTF;
   double donchianUpperHTF;
   double donchianLowHTF;
   double atr_value;
   // Variables for tracking price extremes

   void ProcessTickCommon(double price, double currentLow, double currentHigh, int shift) override
   {
      HandleValuesBase *baseValues = GetIndicatorValues(shift);
      HandleValues *handleValues = (HandleValues *)baseValues;

      TradingSignals signals = EvaluateTradingSignals(handleValues, price);
      if (AcceptBuy && signals.buy)
      {
         stoploss = UpdateTopAndBottom(true, shift, price);
      }

      if (AcceptSell && signals.sell)
      {
         stoploss = UpdateTopAndBottom(false, shift, price);
      }
      ApplyBuy = signals.buy && !signals.closeBuy;
      ApplySell = signals.sell && !signals.closeSell;
      tradeCustom.OpenOrder(ApplyBuy, ApplySell, AcceptBuy, AcceptSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe, stoploss);
      tradeCustom.CloseOrder(signals.closeBuy, signals.closeSell, riskMoney, lotThreshold, MagicNumber, OrderEntryOption, SelectedTimeframe);
   }

   HandleValuesBase *GetIndicatorValues(int shift) override
   {
      if (donchian_handle_htf == INVALID_HANDLE || donchian_handle_ltf == INVALID_HANDLE || ma_handle_first == INVALID_HANDLE || ma_handle_second == INVALID_HANDLE)
      {
         Print("Error creating handle: ", GetLastError());
         return NULL;
      }
      double donchianUpperHTFBufer[];
      double donchianMidHTFBufer[];
      double donchianLowHTFBufer[];
      double donchianLowerLTFBufer[];
      double donchianMidLTFBufer[];
      double donchianUpperLTFBufer[];
      double ma1BufferBufer[];
      double ma2BufferBufer[];
      double atrBufferBufer[];
      int copiedATR = CopyBuffer(ATRHandle, 0, shift, 1, atrBufferBufer);
      int copiedUpperHTF = CopyBuffer(donchian_handle_htf, 0, shift, 1, donchianUpperHTFBufer);
      int copiedMidHTF = CopyBuffer(donchian_handle_htf, 1, shift, 1, donchianMidHTFBufer);
      int copiedLowHTF = CopyBuffer(donchian_handle_htf, 2, shift, 1, donchianLowHTFBufer);
      int copiedUpperLTF = CopyBuffer(donchian_handle_ltf, 0, shift, 1, donchianUpperLTFBufer);
      int copiedMidLTF = CopyBuffer(donchian_handle_ltf, 1, shift, 1, donchianMidLTFBufer);
      int copiedLowerLTF = CopyBuffer(donchian_handle_ltf, 2, shift, 1, donchianLowerLTFBufer);
      int copiedMA1 = CopyBuffer(ma_handle_first, 0, shift, 2, ma1BufferBufer);
      int copiedMA2 = CopyBuffer(ma_handle_second, 0, shift, 2, ma2BufferBufer);

      donchianUpperHTF = donchianUpperHTFBufer[0];
      donchianMidHTF = donchianMidHTFBufer[0];
      donchianLowHTF = donchianLowHTFBufer[0];
      donchianLowerLTF = donchianLowerLTFBufer[0];
      donchianMidLTF = donchianMidLTFBufer[0];
      donchianUpperLTF = donchianUpperLTFBufer[0];
      ma_value_first = ma1BufferBufer[1];
      ma_value_firstPrev = ma1BufferBufer[0];
      ma_value_second = ma2BufferBufer[1];
      ma_value_secondPrev = ma2BufferBufer[0];
      atr_value = atrBufferBufer[0];

      return GetPointer(this);
   }

   TradingSignals EvaluateTradingSignals(HandleValuesBase *baseValues, double price) override
   {
      TradingSignals signals = {false, false, false, false};

      signals.buy = ma_value_first > ma_value_second && ma_value_firstPrev < ma_value_secondPrev && price > donchianUpperHTF;
      signals.sell = ma_value_first < ma_value_second && ma_value_firstPrev > ma_value_secondPrev && price < donchianLowHTF;
      signals.closeBuy = price < donchianLowHTF || ma_value_first <= ma_value_second;
      signals.closeSell = price > donchianUpperHTF || ma_value_first >= ma_value_second;
      return signals;
   }
   double UpdateTopAndBottom(bool isBuy, int shift, double price)
   {

      if (isBuy)
      {
         switch (stoplossBuyOption)
         {
         case BUY_STOPLOSS_BB:
            return donchianLowHTF;
         case BUY_STOPLOSS_ATR:
            return SymbolInfoDouble(_Symbol, SYMBOL_BID) - (atr_value * ATRFactor);
         }
      }
      else
      {
         switch (stoplossSellOption)
         {
         case SELL_STOPLOSS_BB:
            return donchianUpperHTF;
         case SELL_STOPLOSS_ATR:
            return SymbolInfoDouble(_Symbol, SYMBOL_ASK) + (atr_value * ATRFactor);
         }
      }

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
   donchian_handle_htf = iCustom(_Symbol, SelectedTimeframe, "Donchian Channel", InpDonchianPeriodHTF, false);

   donchian_handle_ltf = iCustom(_Symbol, SelectedTimeframe, "Donchian Channel", InpDonchianPeriodLTF, false);

   ma_handle_first = iMA(_Symbol, SelectedTimeframe, InpMA1Period, 0, ma1_method, MA1_Apply);
   ma_handle_second = iMA(_Symbol, SelectedTimeframe, InpMA2Period, 0, ma2_method, MA2_Apply);
   ATRHandle = iATR(_Symbol, SelectedTimeframe, ATRPeriod);

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
   if (donchian_handle_htf != INVALID_HANDLE)
      IndicatorRelease(donchian_handle_htf);
   if (donchian_handle_ltf != INVALID_HANDLE)
      IndicatorRelease(donchian_handle_ltf);
   if (ma_handle_first != INVALID_HANDLE)
      IndicatorRelease(ma_handle_first);
   if (ma_handle_second != INVALID_HANDLE)
      IndicatorRelease(ma_handle_second);
   if (ATRHandle != INVALID_HANDLE)
      IndicatorRelease(ATRHandle);
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
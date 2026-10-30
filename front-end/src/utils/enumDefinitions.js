// MT5 Built-in Enum Definitions for INI Generator
export const MT5_ENUMS = {
  "ENUM_APPLIED_PRICE": [
    { value: "PRICE_CLOSE", label: "1 – Close price" },
    { value: "PRICE_OPEN", label: "2 – Open price" },
    { value: "PRICE_HIGH", label: "3 – High price" },
    { value: "PRICE_LOW", label: "4 – Low price" },
    { value: "PRICE_MEDIAN", label: "5 – Median (H+L)/2" },
    { value: "PRICE_TYPICAL", label: "6 – Typical (H+L+C)/3" },
    { value: "PRICE_WEIGHTED", label: "7 – Weighted (H+L+C+C)/4" }
  ],
  "ENUM_APPLIED_VOLUME": [
    { value: "VOLUME_TICK", label: "0 – Tick volume" },
    { value: "VOLUME_REAL", label: "1 – Trade volume" }
  ],
  "ENUM_MA_METHOD": [
    { value: "MODE_SMA", label: "0 – Simple (SMA)" },
    { value: "MODE_EMA", label: "1 – Exponential (EMA)" },
    { value: "MODE_SMMA", label: "2 – Smoothed (SMMA)" },
    { value: "MODE_LWMA", label: "3 – Linear-weighted (LWMA)" }
  ],
  "ENUM_STO_PRICE": [
    { value: "STO_LOWHIGH", label: "0 – Low/High prices" },
    { value: "STO_CLOSECLOSE", label: "1 – Close/Close prices" }
  ],
  "OrderEntryMode": [
    { value: "ENTRY_ATO", label: "0 - At the open" },
    { value: "ENTRY_ATC", label: "1 - At the close" },
    { value: "ENTRY_LIMIT_PREV_CLOSE", label: "2 - Limit at previous close" }
  ],
  "bool": [
    { value: "false", label: "False" },
    { value: "true", label: "True" }
  ],
  "ENUM_TIMEFRAME": [
    { value: "PERIOD_CURRENT", label: "0 – Current" },
    { value: "PERIOD_M1", label: "1 – M1" },
    { value: "PERIOD_M2", label: "2 – M2" },
    { value: "PERIOD_M3", label: "3 – M3" },
    { value: "PERIOD_M4", label: "4 – M4" },
    { value: "PERIOD_M5", label: "5 – M5" },
    { value: "PERIOD_M6", label: "6 – M6" },
    { value: "PERIOD_M10", label: "10 – M10" },
    { value: "PERIOD_M12", label: "12 – M12" },
    { value: "PERIOD_M15", label: "15 – M15" },
    { value: "PERIOD_M20", label: "20 – M20" },
    { value: "PERIOD_M30", label: "30 – M30" },
    { value: "PERIOD_H1", label: "16385 – H1" },
    { value: "PERIOD_H2", label: "16386 – H2" },
    { value: "PERIOD_H3", label: "16387 – H3" },
    { value: "PERIOD_H4", label: "16388 – H4" },
    { value: "PERIOD_H6", label: "16390 – H6" },
    { value: "PERIOD_H8", label: "16392 – H8" },
    { value: "PERIOD_H12", label: "16396 – H12" },
    { value: "PERIOD_D1", label: "16408 – D1" },
    { value: "PERIOD_W1", label: "32769 – W1" },
    { value: "PERIOD_MN1", label: "49153 – MN1" }
  ]
};

// MQL5 uses ENUM_TIMEFRAMES while the UI historically used ENUM_TIMEFRAME.
MT5_ENUMS.ENUM_TIMEFRAMES = MT5_ENUMS.ENUM_TIMEFRAME;

// Enum value mapped to numeric MT5 constants
export const ENUM_MAPPING = {
  "PRICE_CLOSE": 1, "PRICE_OPEN": 2, "PRICE_HIGH": 3, "PRICE_LOW": 4,
  "PRICE_MEDIAN": 5, "PRICE_TYPICAL": 6, "PRICE_WEIGHTED": 7,
  "VOLUME_TICK": 0, "VOLUME_REAL": 1,
  "MODE_SMA": 0, "MODE_EMA": 1, "MODE_SMMA": 2, "MODE_LWMA": 3,
  "STO_LOWHIGH": 0, "STO_CLOSECLOSE": 1,
  "PERIOD_CURRENT": 0, "PERIOD_M1": 1, "PERIOD_M2": 2, "PERIOD_M3": 3, "PERIOD_M4": 4, 
  "PERIOD_M5": 5, "PERIOD_M6": 6, "PERIOD_M10": 10, "PERIOD_M12": 12, "PERIOD_M15": 15, 
  "PERIOD_M20": 20, "PERIOD_M30": 30, "PERIOD_H1": 16385, "PERIOD_H2": 16386, 
  "PERIOD_H3": 16387, "PERIOD_H4": 16388, "PERIOD_H6": 16390, "PERIOD_H8": 16392, 
  "PERIOD_H12": 16396, "PERIOD_D1": 16408, "PERIOD_W1": 32769, "PERIOD_MN1": 49153,
  // Custom LotusQuant Library Enums
  "ENTRY_ATO": 0, "ENTRY_ATC": 1, "ENTRY_LIMIT_PREV_CLOSE": 2
};

// Legacy export for backwards compatibility
export const enumDefinitions = {
  ENUM_MA_METHOD: [
    { value: 1, label: "MODE_SMA" },
    { value: 2, label: "MODE_EMA" },
    { value: 3, label: "MODE_SMMA" },
    { value: 4, label: "MODE_LWMA" }
  ],
  ENUM_APPLIED_PRICE: [
    { value: 1, label: "PRICE_CLOSE" },
    { value: 2, label: "PRICE_OPEN" },
    { value: 3, label: "PRICE_HIGH" },
    { value: 4, label: "PRICE_LOW" },
    { value: 5, label: "PRICE_MEDIAN" },
    { value: 6, label: "PRICE_TYPICAL" },
    { value: 7, label: "PRICE_WEIGHTED" }
  ],
  ENUM_APPLIED_VOLUME: [
    { value: 1, label: "VOLUME_TICK" },
    { value: 2, label: "VOLUME_REAL" },
  ],
  ENUM_TIMEFRAMES: [
    { value: 1, label: "PERIOD_M1" },
    { value: 5, label: "PERIOD_M5" },
    { value: 15, label: "PERIOD_M15" },
    { value: 30, label: "PERIOD_M30" },
    { value: 16385, label: "PERIOD_H1" },
    { value: 16388, label: "PERIOD_H4" },
    { value: 16408, label: "PERIOD_D1" },
    { value: 32769, label: "PERIOD_W1" },
    { value: 49153, label: "PERIOD_MN1" }
  ]
};

// Export both versions for compatibility
export default {
  ...enumDefinitions,
  ENUM_TIMEFRAME: MT5_ENUMS.ENUM_TIMEFRAME,
  ENUM_MA_METHOD: MT5_ENUMS.ENUM_MA_METHOD.map((item, idx) => ({
    value: idx + 1,
    label: item.value
  })),
  ENUM_APPLIED_PRICE: MT5_ENUMS.ENUM_APPLIED_PRICE.map((item, idx) => ({
    value: idx + 1,
    label: item.value
  })),
  ENUM_APPLIED_VOLUME: MT5_ENUMS.ENUM_APPLIED_VOLUME.map((item, idx) => ({
    value: idx + 1,
    label: item.value
  }))
};

// Helper function to convert numeric value to enum string
export const getEnumStringFromValue = (enumType, numericValue) => {
  // Reverse lookup: find enum string key from numeric value
  for (const [enumString, value] of Object.entries(ENUM_MAPPING)) {
    if (value === numericValue) {
      return enumString;
    }
  }
  return null;
};

// Helper function to convert enum string to numeric value
export const getNumericValueFromEnum = (enumString) => {
  return ENUM_MAPPING[enumString] ?? null;
};

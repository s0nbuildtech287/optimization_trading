// Timeframe mapping MT5
export const PERIOD_MAP = {
  "M1": { chart: "1", input: "1" },
  "M5": { chart: "5", input: "5" },
  "M15": { chart: "15", input: "15" },
  "M30": { chart: "30", input: "30" },
  "H1": { chart: "60", input: "16385" },
  "H4": { chart: "240", input: "16388" },
  "D1": { chart: "1440", input: "16408" },
  "W1": { chart: "10080", input: "16417" },
  "MN": { chart: "43200", input: "16425" }
};

// Suffix mapping for file names
export const SUFFIX_MAP = {
  "H1OB": "01",
  "H1OS": "11",
  "H4OB": "04",
  "H4OS": "14"
};

// Batch processing
export const BATCH_SIZE = 40;

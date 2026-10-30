// src/service/checkFileService.js
// Kiểm tra tính hợp lệ của file xlsx backtest trước khi upload lên Drive
// 
// ─── CẤU TRÚC FILE OPTIMIZATION ───
// 1. Check trên Drive (Group 1):
//    - Tên file phải viết HOA toàn bộ
//    - Format chuẩn: {BotId}{Symbol}{Timeframe}{OrderType}
//    - BotId đúng 3 chữ số
//    - Symbol thuộc danh sách hợp lệ
//    - Timeframe là H1 hoặc H4
//    - OrderType là OB hoặc OS
//
// 2. Check trên Drive (Group 2):
//    - Mỗi cặp BotId+Symbol phải có đủ H1OB, H1OS, H4OB, H4OS
//    - Không có 2 file trùng tên trong cùng folder
//    - Phát hiện file nào tên lạ ko đúng theo format tên
//    - Tối thiểu 3600 file cho toàn bộ folder drive
//
// ─── DỮ LIỆU TRONG FILE ───
// 1. Kiểm tra thông tin cơ bản (Group 3):
//    - Symbol, Timeframe, BotId trong file phải khớp tên file
//    - OB: AcceptBuy=true, AcceptSell=false / OS: AcceptSell=true, AcceptBuy=false
//    - Total Net Profit ≥ 0 (điều kiện duyệt file)
//    - Total Trades ≥ 100 (điều kiện duyệt file)
//    - Largest Loss Trade ≥ -20,000 (điều kiện duyệt file)
//    - Profit Factor > 1.0 (điều kiện duyệt file)
//    - Liệt kê các deal mở lệnh có comment không khớp pattern chuẩn {id}_{size}_{price}_{tf}_{type}{n}
//
// 2. Kiểm tra logic giao dịch (Group 4):
//    - Không có deal đóng ngay sau khi mở (cùng timestamp)
//    - Không mở lệnh mới khi chưa đóng lệnh cũ
//    - Không có cặp lệnh buy/buy hoặc sell/sell liền nhau
//    - Không có chia lệnh (B2, B3 trong comment)
//    - Swap = 0
//    - Volume > 0
//    - Không giữ lệnh < 1 phút rồi đóng bằng _CO

const XLSX = require("xlsx");
const { parseSettings, parseResults } = require("../utils/parseSheetMetaData");
const syncProgressTracker = require("../utils/syncProgressTracker");
const ggSheetService = require("./ggSheetService");
const googleSheet = require("../config/googleSheet");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VALID_SYMBOLS = ["BTCUSD", "ETHUSD", "XAUUSD", "XAGUSD", "US500", "DE30", "JP225", "HK50", "USOIL", "STOXX50", "UK100", "US30", "USTECH", "NAS100", "UKOIL", "DE40"];
const VALID_TIMEFRAMES = ["H1", "H4"];
const VALID_ORDER_TYPES = ["OB", "OS"];

const DRIVE_EXPORT_TIMEOUT_MS = Number(process.env.CHECK_FILES_DRIVE_EXPORT_TIMEOUT_MS || 180000);
const DRIVE_EXPORT_MAX_RETRIES = Number(process.env.CHECK_FILES_DRIVE_EXPORT_MAX_RETRIES || 8);

const LOG_PROGRESS_EVERY = Number(process.env.CHECK_FILES_LOG_EVERY || 50);

const nowIso = () => new Date().toISOString();

const logInfo = (syncId, message, meta = {}) => {
  console.log(`[check-files][${nowIso()}][${syncId}] ${message}`, meta);
};

const logWarn = (syncId, message, meta = {}) => {
  console.warn(`[check-files][${nowIso()}][${syncId}] ${message}`, meta);
};

const logError = (syncId, message, meta = {}) => {
  console.error(`[check-files][${nowIso()}][${syncId}] ${message}`, meta);
};

const isRetryableDriveError = (error) => {
  const message = (error?.message || "").toLowerCase();
  const code = error?.code || error?.response?.status;

  return (
    code === 429 ||
    code === 500 ||
    code === 502 ||
    code === 503 ||
    code === 403 ||
    code === 404 ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("timeout") ||
    message.includes("etimedout") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("enotfound") ||
    message.includes("econnrefused") ||
    message.includes("insufficient permission") ||
    message.includes("file not found")
  );
};

const isNotExportableDriveError = (error) => {
  const message = (error?.message || "").toLowerCase();
  return (
    message.includes("filenotexportable") ||
    message.includes("cannot be exported") ||
    message.includes("not exportable") ||
    message.includes("docs editors files") ||
    message.includes("only supports docs editors")
  );
};


const { parseVolume } = require("../utils/parseDeals");

/**
 * Parse volume từ MT5 export trong deal list.
 * MT5 đôi khi export dạng "open/close" (vd: "1.5/1.5") → lấy phần đầu.
 * Sau đó delegate sang parseDeals.parseVolume để handle K/M suffix.
 *
 * @param {string|number} value
 * @returns {number|null}
 */
const parseDealVolume = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).split("/")[0].trim();
  return parseVolume(normalized);
};

const detectFileType = (deals) => {
  const buyCount = deals.reduce((count, deal) => count + (/_B\d+$/i.test(deal.comment || "") ? 1 : 0), 0);
  const sellCount = deals.reduce((count, deal) => count + (/_S\d+$/i.test(deal.comment || "") ? 1 : 0), 0);
  return buyCount >= sellCount ? { fileType: "Buy", typeChar: "B" } : { fileType: "Sell", typeChar: "S" };
};

const exportDriveFileWithRetry = async ({ fileId, fileName, syncId }) => {
  let lastError = null;
  const exportStart = Date.now();

  for (let attempt = 0; attempt <= DRIVE_EXPORT_MAX_RETRIES; attempt++) {
    const drive = googleSheet.getNextDriveClient();
    const isRetryAttempt = attempt > 0;

    if (isRetryAttempt) {
      const delayMs = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      await sleep(delayMs);
    }

    try {
      const exportPromise = drive.files
        .export(
          {
            fileId,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          {
            responseType: "arraybuffer",
            timeout: DRIVE_EXPORT_TIMEOUT_MS,
          },
        )
        .catch(async (exportErr) => {
          if (!isNotExportableDriveError(exportErr)) {
            throw exportErr;
          }

          logInfo(syncId, "File không export được, chuyển sang download raw", {
            fileName,
            fileId,
            reason: exportErr.message,
          });

          const rawRes = await drive.files.get(
            {
              fileId,
              alt: "media",
            },
            {
              responseType: "arraybuffer",
              timeout: DRIVE_EXPORT_TIMEOUT_MS,
            },
          );
          return rawRes;
        });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${DRIVE_EXPORT_TIMEOUT_MS}ms`)), DRIVE_EXPORT_TIMEOUT_MS);
      });

      const res = await Promise.race([exportPromise, timeoutPromise]);
      return Buffer.from(res.data);
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < DRIVE_EXPORT_MAX_RETRIES && isRetryableDriveError(error);

      if (!shouldRetry) {
        break;
      }

      logWarn(syncId, `Retry export ${attempt + 1}/${DRIVE_EXPORT_MAX_RETRIES}`, {
        fileName,
        fileId,
        error: error.message,
      });
    }
  }

  logError(syncId, "Export Drive thất bại sau retries", {
    fileName,
    fileId,
    durationMs: Date.now() - exportStart,
    error: lastError?.message || "Unknown error",
  });

  throw new Error(`Không export được file từ Drive (${fileName}): ${lastError?.message || "Unknown error"}`);
};

// ─── Parse file name ──────────────────────────────────────────────────────────
const analyzeFileName = (name) => {
  const base = name.replace(/\.[^/.]+$/, "");

  const errors = [];
  const normalizedBase = base.toUpperCase();

  // Check if ALL CAPS (Requirement 2.2)
  if (base !== base.toUpperCase()) {
    errors.push({ error_code: "FILENAME_NOT_UPPERCASE", group: 1, description: "Tên file phải viết hoa toàn bộ" });
  }
  
  const botIdMatch = normalizedBase.match(/^(\d{3})/);
  if (!botIdMatch) {
    errors.push({ error_code: "FILENAME_BOT_ID_INVALID", group: 1, description: "Thiếu hoặc sai định dạng BotId (phải là 3 chữ số)" });
  }
  const botId = botIdMatch?.[1] || null;
  const rest = normalizedBase.slice(3);

  let symbol = null;
  let afterSymbol = rest;
  for (const sym of VALID_SYMBOLS) {
    if (rest.startsWith(sym)) {
      symbol = sym;
      afterSymbol = rest.slice(sym.length);
      break;
    }
  }
  if (!symbol) {
    const guessed = rest.replace(/H1|H4|OB|OS/g, "").replace(/^(.{0,8}).*/, "$1");
    errors.push({ error_code: "FILENAME_SYMBOL_INVALID", group: 1, description: `Symbol không hợp lệ: ${guessed || rest}` });
  }

  let timeframe = null;
  let afterTf = afterSymbol;
  for (const tf of VALID_TIMEFRAMES) {
    if (afterSymbol.startsWith(tf)) {
      timeframe = tf;
      afterTf = afterSymbol.slice(tf.length);
      break;
    }
  }
  if (!timeframe) {
    errors.push({ error_code: "FILENAME_TIMEFRAME_INVALID", group: 1, description: `Timeframe không hợp lệ: ${afterSymbol.slice(0, 2) || afterSymbol}` });
  }

  let orderType = null;
  for (const ot of VALID_ORDER_TYPES) {
    if (afterTf === ot) {
      orderType = ot;
      break;
    }
  }
  if (!orderType) {
    errors.push({ error_code: "FILENAME_ORDER_TYPE_INVALID", group: 1, description: `Thiếu hoặc sai OrderType (phải là OB hoặc OS): ${afterTf}` });
  }

  return { valid: errors.length === 0, errors, botId, symbol, timeframe, orderType };
};

const parseFileName = (name) => {
  const analyzed = analyzeFileName(name);
  if (!analyzed.valid) return null;
  return {
    botId: analyzed.botId,
    symbol: analyzed.symbol,
    timeframe: analyzed.timeframe,
    orderType: analyzed.orderType,
  };
};

const buildNameValidationResults = (fileList) => {
  const results = [];
  const validByPair = new Map();
  const comboCounts = new Map();

  // ─── Cấu trúc file optimization 2: Check tối thiểu 3600 file ───
  const MIN_TOTAL_FILES = 3600;
  if (fileList.length < MIN_TOTAL_FILES) {
    results.push({
      fileName: "[Tổng số file]",
      error_code: "FOLDER_TOTAL_FILES_BELOW_MINIMUM",
      group: 2,
      description: `Tổng số file không đủ: ${fileList.length}/${MIN_TOTAL_FILES} (thiếu ${MIN_TOTAL_FILES - fileList.length} file)`,
      status: "Lỗi",
    });
  }

  // Check duplicate literal file names (e.g. same file uploaded twice to Drive)
  const nameCounts = new Map();
  for (const item of fileList) {
    const n = item.fileName;
    if (!nameCounts.has(n)) nameCounts.set(n, 0);
    nameCounts.set(n, nameCounts.get(n) + 1);
  }
  for (const [name, count] of nameCounts.entries()) {
    if (count > 1) {
      results.push({
        fileName: name,
        error_code: "FILENAME_DUPLICATE_IN_FOLDER",
        group: 2,
        description: `Tên file bị trùng trong folder Drive (xuất hiện ${count} lần)`,
        status: "Lỗi",
      });
    }
  }

  for (const item of fileList) {
    // Skip files already flagged as literal duplicates
    if (nameCounts.get(item.fileName) > 1) continue;

    const analyzed = analyzeFileName(item.fileName);
    if (!analyzed.valid) {
      for (const error of analyzed.errors) {
        results.push({
          fileName: item.fileName,
          error_code: error.error_code,
          group: error.group,
          description: error.description,
          status: "Lỗi",
        });
      }
      continue;
    }

    const pairKey = `${analyzed.botId}${analyzed.symbol}`;
    const comboKey = `${analyzed.botId}${analyzed.symbol}${analyzed.timeframe}${analyzed.orderType}`;

    if (!validByPair.has(pairKey)) validByPair.set(pairKey, []);
    validByPair.get(pairKey).push({ fileName: item.fileName, timeframe: analyzed.timeframe, orderType: analyzed.orderType });

    if (!comboCounts.has(comboKey)) comboCounts.set(comboKey, []);
    comboCounts.get(comboKey).push(item.fileName);
  }

  for (const [comboKey, names] of comboCounts.entries()) {
    if (names.length > 1) {
      results.push({
        fileName: `[Trùng] ${comboKey}`,
        error_code: "FILENAME_DUPLICATE_COMBINATION",
        group: 2,
        description: `Trùng file: ${names.join(", ")}`,
        status: "Lỗi",
      });
    }
  }

  for (const [pairKey, files] of validByPair.entries()) {
    const required = ["H1OB", "H1OS", "H4OB", "H4OS"];
    const present = files.map((f) => `${f.timeframe}${f.orderType}`);
    const missing = required.filter((r) => !present.includes(r));

    if (missing.length > 0) {
      results.push({
        fileName: `[Bộ ${pairKey}]`,
        error_code: "FILENAME_REQUIRED_SET_INCOMPLETE",
        group: 2,
        description: `Thiếu file: ${missing.join(", ")}`,
        status: "Lỗi",
      });
    }
  }

  return results;
};

// ─── Group 3: Check content of one file ──────────────────────────────────────
const checkFileContent = (fileName, buffer, config) => {
  const errors = [];
  const parsed = parseFileName(fileName);

  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (e) {
    errors.push({ fileName, error_code: "FILE_XLSX_READ_FAILED", group: 3, description: `Không đọc được file xlsx: ${e.message}`, status: "Lỗi" });
    return errors;
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const settings = parseSettings(rows);
  const results = parseResults(rows);

  if (!settings) {
    errors.push({ fileName, error_code: "CONTENT_SETTINGS_MISSING", group: 3, description: "Không tìm thấy phần Settings trong file", status: "Lỗi" });
  } else {
    // Symbol check
    if (parsed && !settings.symbol) {
      errors.push({ fileName, error_code: "CONTENT_SYMBOL_MISSING", group: 3, description: "Thiếu Symbol trong phần Settings", status: "Lỗi" });
    } else if (parsed && settings.symbol && settings.symbol.toUpperCase() !== parsed.symbol) {
      errors.push({
        fileName,
        error_code: "CONTENT_SYMBOL_MISMATCH",
        group: 3,
        description: `Symbol mâu thuẫn: tên file=${parsed.symbol}, nội dung=${settings.symbol.toUpperCase()}`,
        status: "Lỗi",
      });
    }

    // Timeframe check
    const contentTf = settings.period ? settings.period.toUpperCase() : null;
    if (parsed && !contentTf) {
      errors.push({ fileName, error_code: "CONTENT_TIMEFRAME_MISSING", group: 3, description: "Thiếu Timeframe/Period trong phần Settings", status: "Lỗi" });
    } else if (parsed && contentTf && contentTf !== parsed.timeframe) {
      errors.push({
        fileName,
        error_code: "CONTENT_TIMEFRAME_MISMATCH",
        group: 3,
        description: `Timeframe mâu thuẫn: tên file=${parsed.timeframe}, nội dung=${contentTf}`,
        status: "Lỗi",
      });
    }

    // Expert / BotId check
    if (parsed && !settings.expert) {
      errors.push({ fileName, error_code: "CONTENT_BOT_ID_MISSING", group: 3, description: "Thiếu Expert/BotId trong phần Settings", status: "Lỗi" });
    } else if (parsed && settings.expert) {
      const expertIdMatch = settings.expert.match(/^(\d{3})/);
      const expertId = expertIdMatch ? expertIdMatch[1] : null;
      if (!expertId) {
        errors.push({ fileName, error_code: "CONTENT_BOT_ID_INVALID", group: 3, description: `Expert không chứa BotId 3 chữ số: ${settings.expert}`, status: "Lỗi" });
      } else if (expertId !== parsed.botId) {
        errors.push({
          fileName,
          error_code: "CONTENT_BOT_ID_MISMATCH",
          group: 3,
          description: `BotId mâu thuẫn: tên file=${parsed.botId}, Expert ID=${expertId}`,
          status: "Lỗi",
        });
      }
    }

    // AcceptBuy / AcceptSell check via inputs
    const inputs = settings.inputs || {};
    if (parsed && parsed.orderType === "OB") {
      if (inputs.AcceptBuy !== true || inputs.AcceptSell !== false) {
        errors.push({
          fileName,
          error_code: "CONTENT_OB_DIRECTION_INVALID",
          group: 3,
          description: `Cấu hình OB sai: AcceptBuy=${inputs.AcceptBuy}, AcceptSell=${inputs.AcceptSell}`,
          status: "Lỗi",
        });
      }
    } else if (parsed && parsed.orderType === "OS") {
      if (inputs.AcceptSell !== true || inputs.AcceptBuy !== false) {
        errors.push({
          fileName,
          error_code: "CONTENT_OS_DIRECTION_INVALID",
          group: 3,
          description: `Cấu hình OS sai: AcceptBuy=${inputs.AcceptBuy}, AcceptSell=${inputs.AcceptSell}`,
          status: "Lỗi",
        });
      }
    }
  }

  if (!results) {
    errors.push({ fileName, error_code: "CONTENT_RESULTS_MISSING", group: 3, description: "Không tìm thấy phần Results trong file", status: "Lỗi" });
  } else {
    // Profit check
    if (results.totalNetProfit === null || results.totalNetProfit === undefined) {
      errors.push({ fileName, error_code: "RESULT_NET_PROFIT_MISSING", group: 3, description: "Thiếu Total Net Profit trong phần Results", status: "Lỗi" });
    } else if (results.totalNetProfit < config.minProfit) {
      errors.push({
        fileName,
        error_code: "RESULT_NET_PROFIT_BELOW_MINIMUM",
        group: 3,
        description: `Total Net Profit thấp: ${results.totalNetProfit} (điều kiện duyệt: ≥ ${config.minProfit})`,
        status: "Lỗi",
      });
    }
    // Trades check
    if (results.totalTrades === null || results.totalTrades === 0) {
      errors.push({
        fileName,
        error_code: "RESULT_TRADES_MISSING",
        group: 3,
        description: `Không phát sinh bất kỳ lệnh deal giao dịch nào (Total Trades = ${results.totalTrades ?? 0})`,
        status: "Lỗi",
      });
    } else if (results.totalTrades < config.minTrades) {
      errors.push({
        fileName,
        error_code: "RESULT_TRADES_BELOW_MINIMUM",
        group: 3,
        description: `Total Trades thấp: ${results.totalTrades} (điều kiện duyệt: ≥ ${config.minTrades})`,
        status: "Lỗi",
      });
    }
    // Loss check
    if (results.largestLossTrade === null || results.largestLossTrade === undefined) {
      errors.push({ fileName, error_code: "RESULT_LARGEST_LOSS_MISSING", group: 3, description: "Thiếu Largest Loss Trade trong phần Results", status: "Lỗi" });
    } else if (results.largestLossTrade < config.maxLoss) {
      errors.push({
        fileName,
        error_code: "RESULT_LARGEST_LOSS_OUT_OF_RANGE",
        group: 3,
        description: `Largest Loss Trade vượt ngưỡng: ${results.largestLossTrade} (điều kiện duyệt: ≥ ${config.maxLoss})`,
        status: "Lỗi",
      });
    }
    // Profit Factor check
    if (results.profitFactor === null || results.profitFactor === undefined) {
      errors.push({ fileName, error_code: "RESULT_PROFIT_FACTOR_MISSING", group: 3, description: "Thiếu Profit Factor trong phần Results", status: "Lỗi" });
    } else if (results.profitFactor <= 1.0) {
      errors.push({
        fileName,
        error_code: "RESULT_PROFIT_FACTOR_INVALID",
        group: 3,
        description: `Profit Factor ≤ 1.0: ${results.profitFactor} (điều kiện duyệt: > 1.0)`,
        status: "Lỗi",
      });
    }
  }

  if (errors.length === 0) {
    errors.push({ fileName, group: 3, description: "Nội dung file hợp lệ", status: "OK" });
  }

  return errors;
};

// ─── Group 4: Check deal logic ────────────────────────────────────────────────
const checkDealLogic = (fileName, buffer) => {
  const errors = [];
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return errors;
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Find "Deals" header row
  const dealsRowIndex = rows.findIndex((row) => row[0]?.toString().trim() === "Deals");
  if (dealsRowIndex === -1) {
    errors.push({
      fileName,
      group: 4,
      description: "Không phát sinh bất kỳ lệnh deal giao dịch nào (Không tìm thấy mục Deals)",
      status: "Lỗi",
    });
    return errors;
  }

  // Header row right after "Deals"
  const headerRow = rows[dealsRowIndex + 1];
  if (!headerRow) {
    errors.push({
      fileName,
      group: 4,
      description: "Không phát sinh bất kỳ lệnh deal giao dịch nào (Header mục Deals rỗng)",
      status: "Lỗi",
    });
    return errors;
  }

  const dealsData = rows.slice(dealsRowIndex + 2);

  const colIndex = (name) => headerRow.findIndex((h) => h?.toString().toLowerCase().includes(name.toLowerCase()));

  const timeCol = colIndex("time");
  const dealCol = colIndex("deal");
  const volumeCol = colIndex("volume");
  const typeCol = colIndex("type");
  const commentCol = colIndex("comment");
  const swapCol = colIndex("swap");
  const directionCol = colIndex("direction");
  const entryCol = colIndex("entry");

  if (volumeCol === -1) {
    errors.push({ fileName, error_code: "DEAL_VOLUME_COLUMN_MISSING", group: 4, description: "Thiếu cột Volume trong phần Deals", status: "Lỗi" });
  }
  if (swapCol === -1) {
    errors.push({ fileName, error_code: "DEAL_SWAP_COLUMN_MISSING", group: 4, description: "Thiếu cột Swap trong phần Deals", status: "Lỗi" });
  }

  const isSectionHeader = (row) => {
    const label = row?.[0]?.toString().trim().toLowerCase();
    return ["results", "summary", "settings", "orders", "graph"].includes(label);
  };

  const deals = [];

  for (let i = 0; i < dealsData.length; i++) {
    const row = dealsData[i];
    if (!row || isSectionHeader(row)) break;
    if (!row[timeCol]) continue;

    const typeVal = row[typeCol]?.toString().trim().toLowerCase() || "";
    if (typeVal !== "buy" && typeVal !== "sell") continue;

    deals.push({
      time: row[timeCol]?.toString().trim() || "",
      deal: row[dealCol] !== undefined && row[dealCol] !== null ? row[dealCol] : i + 1,
      type: typeVal,
      direction: row[directionCol]?.toString().trim().toLowerCase() || row[entryCol]?.toString().trim().toLowerCase() || "",
      volume: parseDealVolume(row[volumeCol]),
      comment: row[commentCol]?.toString().trim() || "",
      swap: row[swapCol],
      excel_row: dealsRowIndex + 2 + i,
    });
  }

  if (deals.length === 0) {
    errors.push({
      fileName,
      group: 4,
      description: "Không phát sinh bất kỳ lệnh deal giao dịch nào (Danh sách Deals rỗng)",
      status: "Lỗi",
    });
    return errors;
  }

  const { typeChar } = detectFileType(deals);
  const splitPattern = new RegExp(`(\\d+_\\d+_[\\d.]+_\\w+)_${typeChar}(\\d+)$`);
  const patOpen = new RegExp(`^\\d+_\\d+_[\\d.]+_\\w+_${typeChar}\\d+$`);
  // MT5 exports may mark a normal close as either _C or _CO.
  const patClose = /^\d+_\d+_[\d.]+_\w+_C(?:O)?$/;
  const patSl = /^sl [\d.]+$/i;
  const patTp = /^tp [\d.]+$/i;
  const patEot = /^end of test$/i;

  const parseCommentParts = (comment) => {
    if (!comment) return null;
    const match = splitPattern.exec(comment);
    if (match) {
      return {
        baseKey: match[1],
        partNo: parseInt(match[2], 10),
      };
    }
    return null;
  };

  let activeOpens = [];
  let lastProcessedDeal = null;
  let lastMatchedOpenForClose = null;

  const volumeErrors = [];
  const swapErrors = [];
  const commentEmptyErrors = [];
  const commentOpenErrors = [];
  const commentCloseErrors = [];
  const splitErrors = [];

  for (let i = 0; i < deals.length; i++) {
    const deal = deals[i];

    // ─── Dữ liệu trong file 2: Kiểm tra logic giao dịch ───
    
    // Volume > 0
    if (deal.volume === null || deal.volume === undefined || deal.volume <= 0) {
      volumeErrors.push({ deal: deal.deal, time: deal.time, val: deal.volume });
    }

    // Swap = 0
    if (deal.swap !== null && deal.swap !== undefined && deal.swap !== "" && parseFloat(deal.swap) !== 0) {
      swapErrors.push({ deal: deal.deal, time: deal.time, val: deal.swap });
    }

    // Liệt kê các deal mở lệnh có comment không khớp pattern chuẩn
    if (!deal.comment) {
      commentEmptyErrors.push({ deal: deal.deal, time: deal.time });
    } else if (deal.direction === "in" && !patOpen.test(deal.comment)) {
      commentOpenErrors.push({ deal: deal.deal, time: deal.time, comment: deal.comment });
    } else if (deal.direction === "out" && !(patClose.test(deal.comment) || patSl.test(deal.comment) || patTp.test(deal.comment) || patEot.test(deal.comment))) {
      commentCloseErrors.push({ deal: deal.deal, time: deal.time, comment: deal.comment });
    }

    // Phân tích thông tin chia lệnh
    let currentBaseKey = null;
    let currentPartNo = null;
    if (deal.direction === "in" && deal.comment) {
      const parsed = parseCommentParts(deal.comment);
      if (parsed) {
        currentBaseKey = parsed.baseKey;
        currentPartNo = parsed.partNo;
        if (currentPartNo > 1) {
          splitErrors.push({ deal: deal.deal, time: deal.time, comment: deal.comment });
        }
      }
    }

    // Không có cặp lệnh buy/buy hoặc sell/sell liền nhau (trừ trường hợp là chia lệnh)
    if (lastProcessedDeal && lastProcessedDeal.type === deal.type) {
      let isAllowedConsecutive = false;
      // B2/B3 split orders are invalid for this optimization export and are
      // deliberately not exempted from the consecutive-order rule.
      if (deal.direction === "in" && !isAllowedConsecutive) {
        errors.push({
          fileName,
          error_code: "DEAL_CONSECUTIVE_SAME_TYPE",
          group: 4,
          description: `Cặp lệnh ${deal.type.toUpperCase()}/${deal.type.toUpperCase()} liền nhau (deal #${lastProcessedDeal.deal} → #${deal.deal}, ${lastProcessedDeal.time} → ${deal.time})`,
          status: "Lỗi",
        });
      }
    }

    // Xử lý mở/đóng vị thế lệnh
    if (deal.direction === "in") {
      if (activeOpens.length > 0) {
        const activeBaseKey = activeOpens[0].baseKey;
        const isSameSplit = activeBaseKey && currentBaseKey && activeBaseKey === currentBaseKey;

        if (!isSameSplit) {
          errors.push({
            fileName,
            error_code: "DEAL_OPEN_BEFORE_CLOSE",
            group: 4,
            description: `Mở lệnh mới khi chưa đóng lệnh cũ (deal #${activeOpens[0].deal} chưa đóng, đã mở deal #${deal.deal})`,
            status: "Lỗi",
          });
          activeOpens = []; // Reset state
        } else {
          // Check for duplicate partNo within the same split
          if (currentPartNo !== null) {
            const duplicate = activeOpens.find((o) => o.partNo === currentPartNo);
            if (duplicate) {
              errors.push({
                fileName,
                error_code: "DEAL_DUPLICATE_SPLIT_PART",
                group: 4,
                description: `Trùng số thứ tự chia lệnh: phần ${typeChar}${currentPartNo} bị lặp lại (deal #${duplicate.deal} và deal #${deal.deal})`,
                status: "Lỗi",
              });
            }
          }
        }
      }
      activeOpens.push({
        time: deal.time,
        deal: deal.deal,
        volume: deal.volume,
        baseKey: currentBaseKey,
        partNo: currentPartNo,
        comment: deal.comment
      });
    } else if (deal.direction === "out") {
      if (activeOpens.length > 0) {
        const matchedOpen = activeOpens.shift();

        // Kiểm tra xem lệnh đóng trùng loại liền nhau có hợp lệ hay không (phải cùng đóng các phần của 1 lệnh chia)
        if (lastProcessedDeal && lastProcessedDeal.type === deal.type && lastProcessedDeal.direction === "out") {
          const prevBaseKey = lastMatchedOpenForClose ? lastMatchedOpenForClose.baseKey : null;
          const currBaseKey = matchedOpen.baseKey;
          if (!prevBaseKey || !currBaseKey || prevBaseKey !== currBaseKey) {
            errors.push({
              fileName,
              error_code: "DEAL_CONSECUTIVE_SAME_TYPE",
              group: 4,
              description: `Cặp lệnh ${deal.type.toUpperCase()}/${deal.type.toUpperCase()} liền nhau (deal #${lastProcessedDeal.deal} → #${deal.deal}, ${lastProcessedDeal.time} → ${deal.time})`,
              status: "Lỗi",
            });
          }
        }

        // Không có deal đóng ngay sau khi mở (cùng timestamp)
        const isInstantClose = matchedOpen.time === deal.time && matchedOpen.volume !== null && deal.volume !== null && matchedOpen.volume === deal.volume;
        const normalizedComment = (deal.comment || "").toLowerCase().trim();
        const isSlOrTpExit = normalizedComment.startsWith("sl ") || normalizedComment.startsWith("tp ");
        if (isInstantClose && !isSlOrTpExit) {
          errors.push({
            fileName,
            error_code: "DEAL_CLOSE_SAME_TIMESTAMP",
            group: 4,
            description: `Đóng lệnh ngay sau khi mở (cùng timestamp: ${deal.time}, deal #${matchedOpen.deal}→#${deal.deal})`,
            status: "Lỗi",
          });
        }

        // Không giữ lệnh < 1 phút rồi đóng bằng _C
        const parseTime = (t) => {
          const normalized = t.replace(/\./g, '-').replace(' ', 'T');
          return new Date(normalized).getTime();
        };
        const openMs = parseTime(matchedOpen.time);
        const closeMs = parseTime(deal.time);
        const holdMs = closeMs - openMs;
        const isCoClose = patClose.test(deal.comment || "");
        if (!isNaN(holdMs) && holdMs > 0 && holdMs < 60000 && isCoClose) {
          errors.push({
            fileName,
            error_code: "DEAL_SHORT_HOLD_CLOSE",
            group: 4,
            description: `Giữ lệnh < 1 phút và đóng bằng _C: mở ${matchedOpen.time} → đóng ${deal.time} (${Math.round(holdMs / 1000)}s, deal #${matchedOpen.deal}→#${deal.deal})`,
            status: "Lỗi",
          });
        }

        lastMatchedOpenForClose = matchedOpen;
      }
    }

    lastProcessedDeal = deal;
  }

  if (swapErrors.length > 0) {
    const sample = swapErrors.slice(0, 2).map((e) => `deal #${e.deal} [${e.val}]`).join(', ');
    errors.push({
      fileName,
      error_code: "DEAL_SWAP_NON_ZERO",
      group: 4,
      description: `Swap ≠ 0: Phát hiện ${swapErrors.length} deal bị swap (VD: ${sample})`,
      status: "Lỗi",
      detailDeals: swapErrors
    });
  }

  if (volumeErrors.length > 0) {
    const sample = volumeErrors.slice(0, 2).map((e) => `deal #${e.deal} [${e.val}]`).join(', ');
    errors.push({
      fileName,
      error_code: "DEAL_VOLUME_NON_POSITIVE",
      group: 4,
      description: `Volume không hợp lệ (≤ 0): Phát hiện ${volumeErrors.length} deal volume ≤ 0 (VD: ${sample})`,
      status: "Lỗi",
      detailDeals: volumeErrors
    });
  }

  if (commentOpenErrors.length > 0) {
    const sample = commentOpenErrors.slice(0, 2).map((e) => `deal #${e.deal} '${e.comment}'`).join(', ');
    errors.push({
      fileName,
      error_code: "DEAL_COMMENT_OPEN_INVALID",
      group: 3,
      description: `Comment sai format mở lệnh: Phát hiện ${commentOpenErrors.length} deal mở lệnh sai format (VD: ${sample})`,
      status: "Lỗi",
      detailDeals: commentOpenErrors
    });
  }

  if (commentCloseErrors.length > 0) {
    const sample = commentCloseErrors.slice(0, 2).map((e) => `deal #${e.deal} '${e.comment}'`).join(', ');
    errors.push({
      fileName,
      error_code: "DEAL_COMMENT_CLOSE_INVALID",
      group: 3,
      description: `Comment sai format đóng lệnh: Phát hiện ${commentCloseErrors.length} deal đóng lệnh sai format (VD: ${sample})`,
      status: "Lỗi",
      detailDeals: commentCloseErrors
    });
  }

  if (commentEmptyErrors.length > 0) {
    const sample = commentEmptyErrors.slice(0, 2).map((e) => `deal #${e.deal}`).join(', ');
    errors.push({
      fileName,
      error_code: "DEAL_COMMENT_EMPTY",
      group: 3,
      description: `Comment trống: Phát hiện ${commentEmptyErrors.length} deal comment trống (VD: ${sample})`,
      status: "Lỗi",
      detailDeals: commentEmptyErrors
    });
  }

  if (splitErrors.length > 0) {
    const sample = splitErrors.slice(0, 2).map((e) => `deal #${e.deal} '${e.comment}'`).join(', ');
    errors.push({
      fileName,
      error_code: "DEAL_SPLIT_ORDER_FORBIDDEN",
      group: 4,
      description: `Không được chia lệnh B2/B3: phát hiện ${splitErrors.length} deal (VD: ${sample})`,
      status: "Lỗi",
      detailDeals: splitErrors,
    });
  }

  if (activeOpens.length > 0) {
    errors.push({
      fileName,
      error_code: "DEAL_UNCLOSED_POSITION",
      group: 4,
      description: `Lệnh chưa được đóng hoàn toàn ở cuối file backtest (còn ${activeOpens.length} phần chưa đóng, deal mở đầu tiên #${activeOpens[0].deal})`,
      status: "Lỗi",
    });
  }

  return errors;
};

// ─── Main runner ──────────────────────────────────────────────────────────────
/**
 * Run Group 3 (+ Group 4) check on uploaded files.
 * @param {{
 *   files: import('multer').File[],
 *   driveUrl?: string,
 *   config: { minProfit: number, minTrades: number, maxLoss: number },
 *   enableGroup4: boolean,
 *   syncId: string
 * }} options
 * @returns {Promise<Array>} array of result rows
 */
const inferErrorCode = (error) => {
  if (error?.error_code) return error.error_code;
  const description = String(error?.description || "").toLowerCase();
  if (description.includes("swap")) return "DEAL_SWAP_NON_ZERO";
  if (description.includes("volume")) return "DEAL_VOLUME_NON_POSITIVE";
  if (description.includes("comment") && description.includes("trống")) return "DEAL_COMMENT_EMPTY";
  if (description.includes("comment")) return description.includes("mở") ? "DEAL_COMMENT_OPEN_INVALID" : "DEAL_COMMENT_CLOSE_INVALID";
  if (description.includes("cùng timestamp")) return "DEAL_CLOSE_SAME_TIMESTAMP";
  if (description.includes("chưa đóng")) return "DEAL_OPEN_BEFORE_CLOSE";
  if (description.includes("liền nhau")) return "DEAL_CONSECUTIVE_SAME_TYPE";
  if (description.includes("chia lệnh") || description.includes("trùng số thứ tự")) return "DEAL_SPLIT_ORDER_FORBIDDEN";
  if (description.includes("giữ lệnh < 1 phút")) return "DEAL_SHORT_HOLD_CLOSE";
  if (description.includes("botid")) return description.includes("tên file") ? "FILENAME_BOT_ID_INVALID" : "CONTENT_BOT_ID_MISMATCH";
  if (description.includes("symbol")) return description.includes("tên file") ? "FILENAME_SYMBOL_INVALID" : "CONTENT_SYMBOL_MISMATCH";
  if (description.includes("timeframe")) return description.includes("tên file") ? "FILENAME_TIMEFRAME_INVALID" : "CONTENT_TIMEFRAME_MISMATCH";
  if (description.includes("ordertype")) return "FILENAME_ORDER_TYPE_INVALID";
  if (description.includes("profit factor")) return "RESULT_PROFIT_FACTOR_INVALID";
  if (description.includes("total trades")) return "RESULT_TRADES_BELOW_MINIMUM";
  if (description.includes("largest loss")) return "RESULT_LARGEST_LOSS_OUT_OF_RANGE";
  if (description.includes("net profit")) return "RESULT_NET_PROFIT_BELOW_MINIMUM";
  return `GROUP_${error?.group ?? "UNKNOWN"}_UNCLASSIFIED`;
};

const normalizeErrorCodes = (rows) => rows.map((row) => ({
  ...row,
  error_code: inferErrorCode(row),
}));

const run = async ({ files, driveUrl, config, enableGroup4, syncId }) => {
  const startedAt = Date.now();
  const allResultsByFileIndex = [];
  let fileList = []; // { fileName, getBuffer: async () => Buffer }

  logInfo(syncId, "Bắt đầu check-files", {
    mode: files && files.length > 0 ? "local" : "drive",
    localFiles: files?.length || 0,
    hasDriveUrl: Boolean(driveUrl),
    enableGroup4,
    config,
  });

  if (files && files.length > 0) {
    // Mode Local — files already in memory via multer
    fileList = files.map((f) => ({
      fileName: f.originalname,
      getBuffer: async () => f.buffer,
    }));
  } else if (driveUrl) {
    // Mode Drive — list files from Drive folder URL
    const listStart = Date.now();
    const driveSheets = await ggSheetService.getAllFilesFromDriveFolderUrl(driveUrl);
    logInfo(syncId, "Đã lấy danh sách file từ Drive", {
      totalFiles: driveSheets.length,
      durationMs: Date.now() - listStart,
    });
    fileList = driveSheets.map((s) => ({
      fileName: `${s.sheetName}.xlsx`,
      getBuffer: async () => exportDriveFileWithRetry({ fileId: s.sheetID, fileName: s.sheetName, syncId }),
    }));
  }

  const nameValidationResults = driveUrl ? buildNameValidationResults(fileList) : [];

  if (driveUrl) {
    const beforeNameFilter = fileList.length;
    fileList = fileList.filter((item) => analyzeFileName(item.fileName).valid);
    const skippedInvalidNames = beforeNameFilter - fileList.length;
    if (skippedInvalidNames > 0) {
      logWarn(syncId, "Bo qua file Drive sai dinh dang ten", {
        skippedInvalidNames,
        remainingFiles: fileList.length,
      });
    }
  }

  await syncProgressTracker.updateSyncProgress(syncId, { totalFiles: fileList.length });

  logInfo(syncId, "Khởi tạo processing", {
    totalFiles: fileList.length,
  });

  if (fileList.length === 0) {
    logWarn(syncId, "Không có file nào để xử lý");
    return [];
  }

  const configuredConcurrency = driveUrl ? Number(process.env.CHECK_FILES_DRIVE_CONCURRENCY || 6) : Number(process.env.CHECK_FILES_LOCAL_CONCURRENCY || 2);
  const workerCount = Math.max(1, Math.min(fileList.length, configuredConcurrency));

  logInfo(syncId, "Thông số chạy", {
    workerCount,
    configuredConcurrency,
    totalFiles: fileList.length,
    logEvery: LOG_PROGRESS_EVERY,
  });

  let nextIndex = 0;
  let processedFiles = 0;
  let successFiles = 0;
  let failedFiles = 0;
  let totalDownloadMs = 0;
  let totalValidateMs = 0;
  let totalDealLogicMs = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= fileList.length) {
        return;
      }

      const { fileName, getBuffer } = fileList[currentIndex];
      await syncProgressTracker.updateSyncProgress(syncId, { currentFile: fileName });

      let buffer;
      try {
        const downloadStart = Date.now();
        buffer = await getBuffer();
        const downloadMs = Date.now() - downloadStart;
        totalDownloadMs += downloadMs;

        const group3Start = Date.now();
        const g3 = checkFileContent(fileName, buffer, config);
        const group3Ms = Date.now() - group3Start;
        totalValidateMs += group3Ms;

        const perFileResults = [...g3];

        if (enableGroup4) {
          const group4Start = Date.now();
          const g4 = checkDealLogic(fileName, buffer);
          const group4Ms = Date.now() - group4Start;
          totalDealLogicMs += group4Ms;
          perFileResults.push(...g4);
        }

        allResultsByFileIndex[currentIndex] = perFileResults;
        successFiles += 1;

        if (processedFiles + 1 <= 3) {
          logInfo(syncId, "File xử lý xong", {
            fileName,
            index: currentIndex + 1,
            totalFiles: fileList.length,
            downloadMs,
            group3Ms,
            group4Enabled: enableGroup4,
          });
        }
      } catch (e) {
        allResultsByFileIndex[currentIndex] = [{ fileName, error_code: "FILE_PROCESSING_FAILED", group: 3, description: `Không đọc được file: ${e.message}`, status: "Lỗi" }];
        failedFiles += 1;
        logWarn(syncId, "File xử lý lỗi", {
          fileName,
          index: currentIndex + 1,
          totalFiles: fileList.length,
          error: e.message,
        });
      } finally {
        buffer = null;
        processedFiles += 1;

        await syncProgressTracker.updateSyncProgress(syncId, {
          processedFiles,
          successFiles,
          failedFiles,
        });

        if (processedFiles % LOG_PROGRESS_EVERY === 0 || processedFiles === fileList.length) {
          logInfo(syncId, "Tiến độ check-files", {
            processedFiles,
            totalFiles: fileList.length,
            successFiles,
            failedFiles,
            progressPct: Math.round((processedFiles / fileList.length) * 100),
          });
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const allResults = normalizeErrorCodes([...nameValidationResults, ...allResultsByFileIndex.flat()]);
  const durationMs = Date.now() - startedAt;

  logInfo(syncId, "Hoàn tất check-files", {
    durationMs,
    totalFiles: fileList.length,
    successFiles,
    failedFiles,
    totalResultRows: allResults.length,
    totalDownloadMs,
    totalValidateMs,
    totalDealLogicMs,
    avgDownloadMsPerFile: Math.round(totalDownloadMs / Math.max(1, fileList.length)),
    avgValidateMsPerFile: Math.round(totalValidateMs / Math.max(1, fileList.length)),
    avgDealLogicMsPerFile: enableGroup4 ? Math.round(totalDealLogicMs / Math.max(1, fileList.length)) : 0,
  });

  return allResults;
};

module.exports = { run };

const opDao = require("../dao/opDao");
const googleSheet = require("../config/googleSheet");
const { logError } = require("./errorLogService");
const constants = require("../utils/constants");
const { db } = require("../config/db");
const ggService = require("./ggSheetService");
const authClients = require("../config/multiServiceAccounts");
const { google } = require("googleapis");
const processQueue = require("../utils/processQueue");
const XLSX = require("xlsx");
const errorLogService = require("../service/errorLogService");
const syncProgressTracker = require("../utils/syncProgressTracker");
const dataValidationService = require("./dataValidationService");
const strategyMetadataDAO = require("../dao/strategyMetadataDao");
const { parseSettings, parseResults } = require("../utils/parseSheetMetaData");
const { parseStrategyName } = require("../utils/strategyNaming");
const { DRIVE_SUMMARY } = require("../utils/messages");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TABLE_NAME = db.backtest.TABLE_NAME;
const ALLOWED_COLUMNS = db.backtest.ALLOWED_COLUMNS;

const processSheetGroups = async (sheetURLs) => {
  const sheetGroups = await ggService.collectAndGroupSheets(sheetURLs);

  const workerIndex = parseInt(process.env.MACHINE_ID || "0");
  const totalWorkers = parseInt(process.env.TOTAL_MACHINES || "1");

  const tasks = sheetGroups.map((group, i) => {
    const auth = authClients[i % authClients.length];

    return (async () => {
      for (const [idx, { sheetID, sheetName }] of group.entries()) {
        const globalIdx = i * group.length + idx;

        if (globalIdx % totalWorkers !== workerIndex) continue;

        await readAndInsertSheet({ sheetID, sheetName, auth, tableName: TABLE_NAME });
      }
    })();
  });

  await Promise.all(tasks);
};

const asyncProcessSheetGroups = async (req, type, noAsyncCall = 12, syncId = null) => {
  const TABLE_NAME = req.body.tableName;
  const strategyArr = req.body.strategyArr;
  const runType = req.body.runType || constants.RUN_TYPE.NEW_RUN;

  // Require opService dynamically to avoid circular dependencies at load time
  const opService = require("./opService");

  try {
    if (![constants.RUN_TYPE.NEW_RUN, constants.RUN_TYPE.UPDATE].includes(runType)) {
      throw new Error(DRIVE_SUMMARY.INVALID_SYNC_MODE);
    }

    let sheetGroups = [];

    if (!TABLE_NAME || !/^backtest[a-z0-9_]*$/i.test(TABLE_NAME)) {
      throw new Error("Invalid table name. Must start with 'backtest' followed by letters, numbers, or underscores.");
    }

    await opService.createDatabaseIfNotExists();
    errorLogService.clearLogs();

    if (type === constants.LOAD_TYPE.DRIVE) {
      if (!req.body.driveFolderUrl) {
        throw new Error("driveFolderUrl is required");
      }
      sheetGroups = await ggService.getAllFilesFromDriveFolderUrl(req.body.driveFolderUrl);
    } else {
      if (!Array.isArray(req.body.sheetURLs) || req.body.sheetURLs.length === 0) {
        throw new Error("sheetURLs is required");
      }
      sheetGroups = await ggService.collectAllSheets(req.body.sheetURLs);
    }

    if (!Array.isArray(sheetGroups) || sheetGroups.length === 0) {
      throw new Error("Không tìm thấy file hợp lệ để sync");
    }

    syncProgressTracker.throwIfSyncCancelled(syncId);
    const discoveredSheetGroups = [...sheetGroups];
    const invalidDriveSheets = type === constants.LOAD_TYPE.DRIVE
      ? sheetGroups.filter((sheet) => {
          const parsed = parseStrategyName(sheet.sheetName);
          return !parsed.botId || !parsed.asset || !parsed.timeframe || !parsed.direction;
        })
      : [];
    const duplicateNames = new Map();
    if (type === constants.LOAD_TYPE.DRIVE) {
      for (const sheet of sheetGroups) {
        const key = String(sheet.sheetName || "").trim().toUpperCase();
        if (!duplicateNames.has(key)) duplicateNames.set(key, []);
        duplicateNames.get(key).push(sheet);
      }
    }
    const duplicateDriveSheets = type === constants.LOAD_TYPE.DRIVE
      ? [...duplicateNames.values()].filter((items) => items.length > 1).flat()
      : [];
    const rejectedDriveSheets = [...new Set([...invalidDriveSheets, ...duplicateDriveSheets])];

    sheetGroups = sheetGroups.filter((sheet) => !rejectedDriveSheets.includes(sheet));
    if (invalidDriveSheets.length > 0) {
      console.warn(`Bo qua ${invalidDriveSheets.length} file Drive sai format strategy:`);
      invalidDriveSheets.forEach((sheet) => console.warn(`   - ${sheet.sheetName}`));
    }
    if (duplicateDriveSheets.length > 0) {
      console.warn(`Bo qua ${duplicateDriveSheets.length} file Drive bi trung ten strategy:`);
      duplicateDriveSheets.forEach((sheet) => console.warn(`   - ${sheet.sheetName}`));
    }
    if (sheetGroups.length === 0) {
      throw new Error("Khong co file Drive nao co ten strategy hop le de sync");
    }

    await opService.createTable(TABLE_NAME, ALLOWED_COLUMNS);

    if (syncId) {
      await syncProgressTracker.updateSyncProgress(syncId, {
        totalFiles: sheetGroups.length,
      });
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`BẮT ĐẦU ĐỒNG BỘ`);
    console.log(`   Table: ${TABLE_NAME}`);
    console.log(`   Mode: ${runType}`);
    console.log(`   Workers: ${noAsyncCall}`);
    console.log(`   Tổng file Drive ban đầu: ${discoveredSheetGroups.length}`);
    if (rejectedDriveSheets.length > 0) {
      console.log(`   Bỏ qua (trùng/lỗi format): ${rejectedDriveSheets.length}`);
    }
    console.log(`   Tổng files hợp lệ sẽ sync: ${sheetGroups.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    let notFoundStrategies = [];
    if (strategyArr && strategyArr.length > 0) {
      const availableSheetNames = new Set(sheetGroups.map((s) => s.sheetName));
      notFoundStrategies = strategyArr.filter((strategyId) => !availableSheetNames.has(strategyId));

      if (notFoundStrategies.length > 0) {
        console.warn(`⚠️  ${notFoundStrategies.length} strategies NOT FOUND in Drive:`);
        notFoundStrategies.forEach((s) => console.warn(`   - ${s}`));

        dataValidationService.writeNotFoundLog(notFoundStrategies, TABLE_NAME, sheetGroups.length);
      }
    }

    const results = new Map();
    discoveredSheetGroups.forEach((sheet) => {
      results.set(sheet.sheetName, {
        status: rejectedDriveSheets.includes(sheet) ? "FAILED" : "NOT_DISPATCHED",
        rowCount: null,
        error: invalidDriveSheets.includes(sheet)
          ? "Invalid strategy filename format"
          : duplicateDriveSheets.includes(sheet) ? "Duplicate strategy filename" : null,
      });
    });

    let sheetsToRun = [];
    if (runType === constants.RUN_TYPE.UPDATE) {
      const strategiesFromDB = await opDao.getDistinctStrategyIds(TABLE_NAME);
      if (strategyArr?.length > 0) {
        sheetsToRun = sheetGroups.filter((s) => strategyArr.includes(s.sheetName));
      } else {
        sheetsToRun = sheetGroups.filter((s) => !strategiesFromDB.includes(s.sheetName));
      }
    } else {
      if (strategyArr?.length > 0) {
        sheetsToRun = sheetGroups.filter((s) => strategyArr.includes(s.sheetName));
      } else {
        sheetsToRun = sheetGroups;
      }
    }

    console.log(`📊 Sheets sẽ chạy: ${sheetsToRun.length}/${sheetGroups.length}`);

    if (syncId) {
      await syncProgressTracker.updateSyncProgress(syncId, {
        totalFiles: sheetsToRun.length,
        processedFiles: 0,
        successFiles: 0,
        failedFiles: 0,
      });
    }

    if (strategyArr && strategyArr.length > 0 && sheetsToRun.length === 0) {
      const warningMsg = `Không tìm thấy bất kỳ strategy nào trong Drive. Đã nhập: ${strategyArr.join(", ")}`;
      console.warn(`⚠️  ${warningMsg}`);

      throw new Error(`Không tìm thấy strategy nào trong Drive URL. Các strategy đã nhập: ${strategyArr.join(", ")}`);
    }

    syncProgressTracker.throwIfSyncCancelled(syncId);
    await opService.clearData(TABLE_NAME, runType);

    sheetsToRun.forEach((sheet) => {
      results.set(sheet.sheetName, {
        status: "QUEUED",
        rowCount: null,
        error: null,
      });
    });

    const taskFunction = async ({ sheetID, sheetName, auth }) => {
      syncProgressTracker.throwIfSyncCancelled(syncId);
      results.set(sheetName, { status: "RUNNING" });

      if (syncId) {
        await syncProgressTracker.updateSyncProgress(syncId, {
          currentFile: sheetName,
        });
      }

      try {
        const insertedCount = await readAndInsertSheet({
          sheetID,
          sheetName,
          auth,
          tableName: TABLE_NAME,
          type,
          replaceExistingStrategy: runType === constants.RUN_TYPE.UPDATE ? sheetName : null,
          syncId,
        });
        results.set(sheetName, {
          status: "SUCCESS",
          rowCount: insertedCount,
          error: null,
        });

        if (syncId) {
          const success = Array.from(results.values()).filter((r) => r.status === "SUCCESS").length;
          const failed = Array.from(results.values()).filter((r) => r.status === "FAILED").length;
          await syncProgressTracker.updateSyncProgress(syncId, {
            processedFiles: success + failed,
            successFiles: success,
            failedFiles: failed,
          });
        }
      } catch (err) {
        if (err?.code === syncProgressTracker.SYNC_CANCELLED_CODE) throw err;
        results.set(sheetName, {
          status: "FAILED",
          rowCount: null,
          error: err.message,
        });

        if (syncId) {
          const success = Array.from(results.values()).filter((r) => r.status === "SUCCESS").length;
          const failed = Array.from(results.values()).filter((r) => r.status === "FAILED").length;
          await syncProgressTracker.updateSyncProgress(syncId, {
            processedFiles: success + failed,
            successFiles: success,
            failedFiles: failed,
          });
        }
      }
    };

    if (strategyArr?.length > 0) {
      console.log(`🔄 UPDATE mode: Processing ${strategyArr.length} strategies...`);

      for (let i = 0; i < strategyArr.length; i++) {
        syncProgressTracker.throwIfSyncCancelled(syncId);
        const strategyId = strategyArr[i];
        const strategyStartTime = Date.now();

        console.log(`\n➡️  [${i + 1}/${strategyArr.length}] Processing strategy: ${strategyId}`);

        if (syncId) {
          await syncProgressTracker.updateSyncProgress(syncId, {
            currentFile: strategyId,
          });
        }

        try {
          const deleteTimeout = Promise.resolve(null);

          const deletedRows = await deleteTimeout;

          if (deletedRows === 0) {
            console.log(`   ℹ️  Strategy ${strategyId} is new (no existing data)`);
          } else {
            console.log(`   ✅ Deleted ${deletedRows} rows for ${strategyId}`);
          }

          console.log(`   💾 Inserting new data for ${strategyId}...`);
          const insertTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Insert timeout after 5 minutes")), 300000));

          await Promise.race([
            processQueue.buildQueueAndRun({
              sheetGroups: sheetsToRun,
              filterFn: (s) => s.sheetName === strategyId,
              taskFunction,
              noAsyncCall,
              shouldStop: () => syncProgressTracker.isSyncCancelled(syncId),
            }),
            insertTimeout,
          ]);

          const strategyDuration = Date.now() - strategyStartTime;
          console.log(`   ✅ Strategy ${strategyId} completed in ${strategyDuration}ms`);
        } catch (strategyErr) {
          if (strategyErr?.code === syncProgressTracker.SYNC_CANCELLED_CODE) throw strategyErr;
          const strategyDuration = Date.now() - strategyStartTime;
          console.error(`   ❌ Strategy ${strategyId} FAILED after ${strategyDuration}ms:`, strategyErr.message);

          results.set(strategyId, {
            status: "FAILED",
            rowCount: null,
            error: `UPDATE failed: ${strategyErr.message}`,
          });

          console.warn(`   ⚠️  Skipping ${strategyId}, continuing with next strategy...`);
          continue;
        }
      }

      console.log(`\n✅ UPDATE mode completed for ${strategyArr.length} strategies`);
    } else {
      await processQueue.buildQueueAndRun({
        sheetGroups: sheetsToRun,
        taskFunction,
        noAsyncCall,
        shouldStop: () => syncProgressTracker.isSyncCancelled(syncId),
      });
    }

    syncProgressTracker.throwIfSyncCancelled(syncId);

    const validationStats = await dataValidationService.generateSyncStats(TABLE_NAME, discoveredSheetGroups, results);
    const { issues: validationIssues = {}, ...stats } = validationStats;
    const failedFiles = [];
    const warningFiles = [];

    for (const [sheetName, info] of results.entries()) {
      if (info.status === "FAILED") {
        failedFiles.push({
          name: sheetName,
          error: info.error,
        });
      }
      if (info.status === "SUCCESS" && info.rowCount === 0) {
        warningFiles.push(sheetName);
      }
    }

    const hasWarnings = stats.failed > 0 || notFoundStrategies.length > 0 || warningFiles.length > 0 || (stats.duplicates || 0) > 0;
    const warningCount = warningFiles.length + (stats.duplicates || 0) + notFoundStrategies.length;
    const issues = {
      duplicate_files: validationIssues.duplicate_files || [],
      failed_files: validationIssues.failed_files || failedFiles.map((item) => ({
        file_name: item.name,
        error_code: "SYNC_FILE_FAILED",
        message: item.error || "File sync failed",
      })),
      warning_files: validationIssues.warning_files || warningFiles.map((fileName) => ({ file_name: fileName })),
      not_found_strategies: notFoundStrategies,
    };

    // Refresh data trong background — scheduleRefresh() tự coalesce nhiều lần gọi
    const mvManager = require('../dao/materializedViewDao');
    mvManager.scheduleRefresh(TABLE_NAME, `sync:${TABLE_NAME}`);
    opService.clearAllCaches(TABLE_NAME);
    console.log("✅ [MV] scheduleRefresh() triggered after sync");

    return {
      stats,
      notFoundStrategies: notFoundStrategies.length > 0 ? notFoundStrategies : undefined,
      availableStrategies: notFoundStrategies.length > 0 ? sheetGroups.map((s) => s.sheetName).slice(0, 20) : undefined,
      _syncSummary: {
        uniqueNames: stats.unique,
        warningCount,
        hasWarnings,
        metadata: {
          drive_url: req.body.driveFolderUrl,
          sync_mode: runType,
          strategy_filter: strategyArr || [],
          batch_stats: {
            total_files: stats.total,
            success_files: stats.success,
            failed_files: stats.failed,
            warning_count: warningCount,
          },
          issues,
        },
      },
    };
  } catch (err) {
    throw err;
  }
};

const readAndInsertSheet = async ({ sheetID, sheetName, auth, tableName, type, replaceExistingStrategy = null, syncId = null }) => {
  try {
    syncProgressTracker.throwIfSyncCancelled(syncId);
    await sleep(1000);

    let data;
    if (type == constants.LOAD_TYPE.DRIVE) {
      data = await readDriveSheet({ sheetID, sheetName, auth, tableName });
    } else {
      data = await readSheet({ sheetID, sheetName, auth });
    }

    syncProgressTracker.throwIfSyncCancelled(syncId);
    const opService = require("./opService");
    if (replaceExistingStrategy) {
      await opDao.deleteByStrategyId(tableName, replaceExistingStrategy);
    }
    const insertedRows = await opService.insertRows(tableName, data, sheetName);
    return insertedRows.length;
  } catch (err) {
    if (err?.code === syncProgressTracker.SYNC_CANCELLED_CODE) throw err;
    let errMsg = `Lỗi khi xử lý sheet "${sheetName}" (ID: ${sheetID}): ${err.message}`;
    await logError(sheetName, "readAndInsertSheet", errMsg, constants.ERROR_TYPE.RUN_TIME);
    console.error(errMsg);
    throw new Error(errMsg);
  }
};

const readSheet = async ({ sheetID, sheetName, auth }) => {
  const sheetsAPI = google.sheets({ version: "v4", auth });

  try {
    const response = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: sheetID,
      range: "Sheet2",
    });

    const values = response.data.values || [];
    const data = ggService.formatSheetData(values, sheetName);

    console.log(` ✅ Đọc thành công: ${sheetName} (${data.length} rows)`);
    return data;
  } catch (err) {
    let errMsg = `Lỗi khi đọc sheet "${sheetName}" (ID: ${sheetID}): ${err.message}`;
    await logError(sheetName, "readSheet", errMsg, constants.ERROR_TYPE.RUN_TIME);

    throw new Error(errMsg);
  }
};

const readDriveSheet = async ({ sheetID, sheetName, auth, tableName }, retryCount = 0, maxRetries = 5) => {
  try {
    if (sheetName.includes(" ")) {
      throw new Error(`Sheet name contains whitespace: "${sheetName}"`);
    }

    const drive = googleSheet.getNextDriveClient();

    if (retryCount > 0) {
      const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 32000);
      console.log(`   ⏳ Waiting ${delay / 1000}s before retry...`);
      await sleep(delay);
    } else {
      await sleep(200);
    }

    console.log(`[${retryCount > 0 ? `RETRY ${retryCount}` : "TRY"}] Đọc sheet: ${sheetName}`);

    const exportPromise = drive.files.export(
      {
        fileId: sheetID,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "arraybuffer", timeout: 60000 }
    );

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout after 60s")), 60000));

    const res = await Promise.race([exportPromise, timeoutPromise]);

    const workbook = XLSX.read(res.data, { type: "buffer" });
    const sheetToRead = workbook.Sheets[workbook.SheetNames[0]];
    const values = XLSX.utils.sheet_to_json(sheetToRead, { header: 1 });

    const settings = parseSettings(values);
    const results = parseResults(values);

    const parsedName = parseStrategyName(sheetName);
    if (!parsedName.botId || !parsedName.asset || !parsedName.timeframe || !parsedName.direction) {
      throw new Error(`Invalid strategy filename format: ${sheetName}`);
    }
    if (!settings) {
      throw new Error(`Khong tim thay Settings trong file ${sheetName}`);
    }

    const contentSymbol = String(settings.symbol || "").trim().toUpperCase();
    const contentTimeframe = String(settings.period || "").trim().toUpperCase();
    if (contentSymbol && contentSymbol !== parsedName.asset) {
      throw new Error(`Symbol mismatch: filename=${parsedName.asset}, content=${contentSymbol}`);
    }
    if (contentTimeframe && contentTimeframe !== parsedName.timeframe) {
      throw new Error(`Timeframe mismatch: filename=${parsedName.timeframe}, content=${contentTimeframe}`);
    }
    const expertText = String(settings.expert || "").trim();
    const expertBotId = expertText.match(/^(\d{3})/)?.[1] || null;
    if (expertBotId && expertBotId !== parsedName.botId) {
      throw new Error(`BotId mismatch: filename=${parsedName.botId}, content=${expertBotId}`);
    }

    console.log(` ✅ Đọc thành công: ${sheetName}`);
    if (settings) console.log(`    📊 Settings: Parsed`);
    if (results) console.log(`    📈 Results: Parsed`);

    const preflightDealsRowIndex = values.findIndex((row) => row && row[0] == "Deals");
    const previewDealRows = preflightDealsRowIndex === -1
      ? []
      : ggService.formatSheetData(values.slice(preflightDealsRowIndex + 1), sheetName);
    const validTradeRows = previewDealRows.filter((row) => {
      const deal = row?.["Deal"];
      const type = String(row?.["Type"] || "").trim().toLowerCase();
      return deal !== null && deal !== undefined && String(deal).trim() !== "" && type !== "balance";
    });
    if (validTradeRows.length === 0) {
      throw new Error(`No valid trade data: Total Trades = ${results?.totalTrades ?? 0}, Deals rows = ${validTradeRows.length}`);
    }

    if (settings || results) {
      try {
        let periodStart = null;
        let periodEnd = null;
        if (settings?.dateRange) {
          const dateMatch = settings.dateRange.match(/(\d{4}\.\d{2}\.\d{2})\s*-\s*(\d{4}\.\d{2}\.\d{2})/);
          if (dateMatch) {
            periodStart = new Date(dateMatch[1].replace(/\./g, "-"));
            periodEnd = new Date(dateMatch[2].replace(/\./g, "-"));
          }
        }

        await strategyMetadataDAO.upsertStrategyMetadata({
          strategyId: sheetName,
          backtestTable: tableName,
          symbol: settings?.symbol || null,
          expertName: settings?.expertName || null,
          expertId: settings?.expertId || null,
          timeframe: settings?.period || null,
          periodStart,
          periodEnd,
          settings: { ...(settings || {}), sheet_id: sheetID },
          results: results || {},
        });

        console.log(`    💾 Saved metadata for ${sheetName}`);
      } catch (err) {
        console.error(`    ⚠️  Failed to save metadata for ${sheetName}:`, err.message);
      }
    }

    const dealsRowIndex = values.findIndex((row) => row && row[0] == "Deals");
    if (dealsRowIndex === -1) {
      console.log(`    ⚠️ No 'Deals' header found in sheet ${sheetName}, returning empty deals array`);
      return [];
    }
    const dataSheet1 = values.slice(dealsRowIndex + 1);

    const data = ggService.formatSheetData(dataSheet1, sheetName);

    console.log(`    📦 Total deals: ${data.length} rows`);

    return data;
  } catch (err) {
    const errorMessage = err.message || err.toString();
    const errorCode = err.code || err.response?.status;

    const isNotFoundError = errorMessage.includes("File not found") || errorCode === 404 || errorMessage.includes("404");
    const isPermissionError = errorMessage.includes("Insufficient Permission") || errorCode === 403 || errorMessage.includes("403");
    const isRateLimitError = errorMessage.includes("rate limit") || errorCode === 429 || errorMessage.includes("429") || errorMessage.includes("quotaExceeded");
    const isServerError = errorCode === 500 || errorCode === 502 || errorCode === 503 || errorMessage.includes("500") || errorMessage.includes("502") || errorMessage.includes("503");
    const isTimeoutError = errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT") || errorMessage.includes("ECONNRESET");
    const isNetworkError = errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND") || errorMessage.includes("network");

    console.error(`   ❌ Error reading ${sheetName}:`);
    console.error(`      Message: ${errorMessage}`);
    console.error(`      Code: ${errorCode || "N/A"}`);
    console.error(
      `      Type: ${isRateLimitError ? "RATE_LIMIT" : isServerError ? "SERVER_ERROR" : isTimeoutError ? "TIMEOUT" : isNetworkError ? "NETWORK" : isPermissionError ? "PERMISSION" : isNotFoundError ? "NOT_FOUND" : "OTHER"}`
    );

    if (isRateLimitError && retryCount < maxRetries) {
      const delay = Math.min(5000 * Math.pow(2, retryCount), 60000);
      console.warn(`   ⚠️  [RATE LIMIT - RETRY ${retryCount + 1}/${maxRetries}] ${sheetName} - Chờ ${delay / 1000}s`);
      await sleep(delay);
      return await readDriveSheet({ sheetID, sheetName, auth, tableName }, retryCount + 1, maxRetries);
    }

    if (isServerError && retryCount < maxRetries) {
      const delay = Math.min(3000 * Math.pow(2, retryCount), 30000);
      console.warn(`   ⚠️  [SERVER ERROR - RETRY ${retryCount + 1}/${maxRetries}] ${sheetName} - Chờ ${delay / 1000}s`);
      await sleep(delay);
      return await readDriveSheet({ sheetID, sheetName, auth, tableName }, retryCount + 1, maxRetries);
    }

    if ((isTimeoutError || isNetworkError) && retryCount < maxRetries) {
      const delay = Math.min(2000 * Math.pow(2, retryCount), 20000);
      console.warn(`   ⚠️  [${isTimeoutError ? "TIMEOUT" : "NETWORK"} - RETRY ${retryCount + 1}/${maxRetries}] ${sheetName} - Chờ ${delay / 1000}s`);
      await sleep(delay);
      return await readDriveSheet({ sheetID, sheetName, auth, tableName }, retryCount + 1, maxRetries);
    }

    if ((isNotFoundError || isPermissionError) && retryCount < maxRetries) {
      const delay = 2000 * (retryCount + 1);
      console.warn(`   ⚠️  [${isPermissionError ? "PERMISSION" : "NOT_FOUND"} - RETRY ${retryCount + 1}/${maxRetries}] ${sheetName} - Chờ ${delay / 1000}s`);
      await sleep(delay);
      return await readDriveSheet({ sheetID, sheetName, auth, tableName }, retryCount + 1, maxRetries);
    }

    let errMsg = `[THẤT BẠI] Không đọc được sheet "${sheetName}" (ID: ${sheetID})`;

    if (isRateLimitError) {
      errMsg += ` | Lỗi: RATE LIMIT - Vượt quota Google API (đã retry ${maxRetries} lần)`;
    } else if (isServerError) {
      errMsg += ` | Lỗi: Google Server Error ${errorCode} (đã retry ${maxRetries} lần)`;
    } else if (isTimeoutError) {
      errMsg += ` | Lỗi: Timeout - Request quá 60s (đã retry ${maxRetries} lần)`;
    } else if (isNetworkError) {
      errMsg += ` | Lỗi: Network Error - Kết nối thất bại (đã retry ${maxRetries} lần)`;
    } else if (isNotFoundError) {
      errMsg += ` | Lỗi: File không tồn tại hoặc không được share với Service Account (đã retry ${maxRetries} lần)`;
    } else if (isPermissionError) {
      errMsg += ` | Lỗi: Service Account không có quyền đọc file này (đã retry ${maxRetries} lần)`;
    } else {
      errMsg += ` | Lỗi: ${errorMessage} (đã retry ${maxRetries} lần)`;
    }

    await logError(sheetName, "readDriveSheet", errMsg, constants.ERROR_TYPE.RUN_TIME);
    throw new Error(errMsg);
  }
};

module.exports = {
  processSheetGroups,
  asyncProcessSheetGroups,
  readAndInsertSheet,
  readSheet,
  readDriveSheet,
};

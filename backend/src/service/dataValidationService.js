const opService = require('./opService');
const ggService = require('./ggSheetService');
const processQueue = require('../utils/processQueue');
const opDao = require("../dao/opDao");
const { db } = require("../config/db");
const { logError } = require("./errorLogService");
const errorLogDAO = require("../dao/errorLogDAO");
const fs = require("fs");
const path = require("path");

// Hàm 1: Lấy stats hiện tại (gọi TRƯỚC sync)
const getCurrentStats = async (tableName) => {
  try {
    const totalInDB = await opDao.getTotalCount(tableName);
    const strategiesInDB = await opDao.getDistinctStrategyIds(tableName);
    const years = await opDao.getDistinctYears(tableName);
    const symbols = await opDao.getDistinctSymbols(tableName);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(` TRẠNG THÁI HIỆN TẠI - ${tableName.toUpperCase()}`);
    console.log(`   Tổng dòng: ${totalInDB.toLocaleString()}`);
    console.log(`   StrategyId: ${strategiesInDB.length}`);
    console.log(`   Symbols: ${symbols.length}`);
    console.log(`   Years: ${years.join(', ')}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return {
      totalRows: totalInDB,
      strategyIds: strategiesInDB.length,
      symbols: symbols.length,
      years: years
    };
  } catch (err) {
    console.error('Lỗi khi lấy stats hiện tại:', err.message);
    return {
      totalRows: 0,
      strategyIds: 0,
      symbols: 0,
      years: []
    };
  }
};

// Hàm 2: Generate stats sau sync (gọi SAU sync)
const generateSyncStats = async (tableName, sheetGroups, results) => {
  const logsDir = path.join(__dirname, "..", "..", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Count duplicates
  const sheetNameCount = new Map();
  const duplicates = new Map();

  for (const sheet of sheetGroups) {
    const count = sheetNameCount.get(sheet.sheetName) || 0;
    sheetNameCount.set(sheet.sheetName, count + 1);

    if (!duplicates.has(sheet.sheetName)) {
      duplicates.set(sheet.sheetName, []);
    }
    duplicates.get(sheet.sheetName).push({
      sheetID: sheet.sheetID,
      sheetName: sheet.sheetName,
    });
  }

  const actualDuplicates = new Map();
  for (const [name, count] of sheetNameCount.entries()) {
    if (count > 1) {
      actualDuplicates.set(name, {
        count: count,
        files: duplicates.get(name),
      });
    }
  }

  const totalDuplicateFiles = Array.from(actualDuplicates.values()).reduce((sum, item) => sum + item.count, 0);
  const uniqueDuplicateNames = actualDuplicates.size;
  const duplicateFileCount = totalDuplicateFiles - uniqueDuplicateNames;

  // Write duplicate.txt
  const duplicateFile = path.join(logsDir, "duplicate.txt");
  if (actualDuplicates.size > 0) {
    let content = `PHÁT HIỆN ${duplicateFileCount} FILES BỊ TRÙNG TÊN (${uniqueDuplicateNames} TÊN)\n\n`;
    content += `Thời gian: ${new Date().toLocaleString("vi-VN")}\n`;
    content += `Table: ${tableName}\n`;
    content += `Tổng files: ${sheetGroups.length}\n`;
    content += `Tên unique: ${sheetNameCount.size}\n`;
    content += `Files bị trùng: ${duplicateFileCount}\n\n`;

    const dupStats = new Map();
    for (const data of actualDuplicates.values()) {
      dupStats.set(data.count, (dupStats.get(data.count) || 0) + 1);
    }

    content += `THỐNG KÊ:\n`;
    for (const [count, names] of Array.from(dupStats.entries()).sort((a, b) => b[0] - a[0])) {
      content += `  Trùng ${count} lần: ${names} tên\n`;
    }
    content += `\nCHI TIẾT:\n\n`;
    
    const sortedDuplicates = Array.from(actualDuplicates.entries()).sort((a, b) => b[1].count - a[1].count);
    for (const [name, data] of sortedDuplicates) {
      content += `${name} (${data.count} lần):\n`;
      data.files.forEach((file, idx) => {
        content += `  ${idx + 1}. ${file.sheetID}\n`;
      });
      content += `\n`;
    }

    fs.writeFileSync(duplicateFile, content, "utf8");
  } else if (fs.existsSync(duplicateFile)) {
    fs.unlinkSync(duplicateFile);
  }

  // Write error.txt
  const errorFile = path.join(logsDir, "error.txt");
  const errorSheets = [];

  for (const info of results.values()) {
    if (info.status === "FAILED") {
      for (const [name, val] of results.entries()) {
        if (val === info) {
          errorSheets.push({ name: name, error: info.error });
          break;
        }
      }
    }
  }

  if (errorSheets.length > 0) {
    let content = `PHÁT HIỆN ${errorSheets.length} FILES BỊ LỖI\n\n`;
    content += `Thời gian: ${new Date().toLocaleString("vi-VN")}\n`;
    content += `Table: ${tableName}\n\n`;

    errorSheets.forEach((item, i) => {
      content += `${i + 1}. ${item.name}\n`;
      content += `   ${item.error}\n\n`;
    });

    fs.writeFileSync(errorFile, content, "utf8");
  } else if (fs.existsSync(errorFile)) {
    fs.unlinkSync(errorFile);
  }

  // Get DB stats
  const totalInDB = await opDao.getTotalCount(tableName);
  const strategiesInDB = await opDao.getDistinctStrategyIds(tableName);

  // Analyze results
  const stats = {
    total: sheetGroups.length,
    success: 0,
    failed: 0,
    empty: 0,
  };

  for (const info of results.values()) {
    if (info.status === "SUCCESS") {
      stats.success++;
      if (info.rowCount === 0) stats.empty++;
    } else if (info.status === "FAILED") {
      stats.failed++;
    }
  }

  // Console log
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(` KẾT QUẢ ĐỒNG BỘ`);
  console.log(`   Tổng files: ${sheetGroups.length}`);
  console.log(`   Tên unique: ${sheetNameCount.size}`);
  console.log(`   Thành công: ${stats.success}`);
  console.log(`   Thất bại: ${stats.failed}`);
  console.log(`   Tổng dòng DB: ${totalInDB.toLocaleString()}`);
  console.log(`   StrategyId DB: ${strategiesInDB.length}`);

  if (duplicateFileCount > 0) {
    console.log(`   ⚠️  Trùng tên: ${duplicateFileCount} files → logs/duplicate.txt`);
  }
  if (errorSheets.length > 0) {
    console.log(`   ❌ Lỗi: ${errorSheets.length} files → logs/error.txt`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  return {
    total: sheetGroups.length,
    unique: sheetNameCount.size,
    success: stats.success,
    failed: stats.failed,
    totalRows: totalInDB,
    strategyIds: strategiesInDB.length,
    duplicates: duplicateFileCount,
    errors: errorSheets.length,
    issues: {
      duplicate_files: Array.from(actualDuplicates.entries()).map(([strategyName, data]) => ({
        strategy_name: strategyName,
        occurrences: data.count,
        files: data.files.map((file) => ({
          sheet_id: file.sheetID,
          file_name: file.sheetName,
        })),
      })),
      failed_files: errorSheets.map((item) => ({
        sheet_id: sheetGroups.find((sheet) => sheet.sheetName === item.name)?.sheetID || null,
        file_name: item.name,
        error_code: "SYNC_FILE_FAILED",
        message: item.error || "File sync failed",
      })),
      warning_files: Array.from(results.entries())
        .filter(([, info]) => info.status === "SUCCESS" && info.rowCount === 0)
        .map(([fileName]) => ({
          file_name: fileName,
          error_code: "EMPTY_DATA",
          message: "File has no rows to insert",
        })),
    },
  };
};

const compareSheetTask = async ({ sheetID, sheetName, auth, tableName }) => {
  const sheetData = await opService.readDriveSheet({ sheetID, sheetName, auth });
  const sheetCount = sheetData.length;
  sheetData.filter(row => {
    return row.Deal && !isNaN(parseInt(row.Deal));
  });
  const dbCount = await opDao.countRows(tableName, sheetName);

  if (sheetCount != dbCount) {
    let err = `Chênh lệch dữ liệu sheet "${sheetName}" (ID: ${sheetID}): Sheet=${sheetCount}, DB=${dbCount}`
    console.warn(err);
    await logError(sheetName, "compareSheetTask", err, "CHECK_LIST");
  }
};

const sumProfitSheetTask = async ({ sheetID, sheetName, auth, tableName }) => {
  const sheetData = await opService.readDriveSheet({ sheetID, sheetName, auth });

  if (!sheetData || sheetData.length < 2) {
    return;
  }

  const validRows = sheetData.filter(row => {
    // chỉ lấy dòng có Deal là số nguyên
    return row.Deal && !isNaN(parseInt(row.Deal));
  });

  const sheetCount = parseFloat(
    validRows.reduce((sum, row) => {
      const profit = parseFloat(row.Profit);
      return sum + (isNaN(profit) ? 0 : profit);
    }, 0).toFixed(2)
  );
  

  const sumProfitDB = await opDao.sumStrategyProfit(tableName, sheetName);

  if (Math.abs(sheetCount - sumProfitDB) > 1e-6) {
    const err = `Chênh lệch tổng profit sheet "${sheetName}" (ID: ${sheetID}): Sheet=${sheetCount}, DB=${sumProfitDB}`;
    console.warn(err);
    await logError(sheetName, "sumProfitSheetTask", err, "CHECK_LIST");
  }
};


const asyncCompareSheetGroups = async (uRLs, tableName, noAsyncCall = 8) => {
  const sheetGroups = await ggService.getAllFilesFromDriveFolderUrl(uRLs);

  await processQueue.buildQueueAndRun({
    sheetGroups,
    taskFunction: compareSheetTask,
    noAsyncCall,
    extraFields: { tableName },
  });
};



const asyncReloadStrategy = async (sheetURLs,tableName, strategyArr = [], noAsyncCall = 8) => {
  if (!strategyArr || strategyArr.length === 0) {
    strategyArr = await errorLogDAO.getDistinctStrategies();
  }

  const sheetGroups = await ggService.collectAllSheets(sheetURLs);

  const taskFunction = async ({ sheetID, sheetName, auth }) => {
    await opService.readAndInsertSheet({ sheetID, sheetName, auth, tableName: tableName });
  };

  await processQueue.buildQueueAndRun({
    sheetGroups,
    filterFn: (sheet) => strategyArr.includes(sheet.sheetName),
    taskFunction,
    noAsyncCall,
  });
};

// Hàm ghi file notfound.txt
const writeNotFoundLog = (notFoundStrategies, tableName, totalSheets) => {
  if (!notFoundStrategies || notFoundStrategies.length === 0) return;

  const logsDir = path.join(__dirname, "..", "..", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const notFoundFile = path.join(logsDir, "notfound.txt");
  let content = `STRATEGIES NOT FOUND IN DRIVE FOLDER\n\n`;
  content += `Thời gian: ${new Date().toLocaleString("vi-VN")}\n`;
  content += `Table: ${tableName}\n`;
  content += `Tổng sheets trong Drive: ${totalSheets}\n`;
  content += `Strategies not found: ${notFoundStrategies.length}\n\n`;
  content += `DANH SÁCH STRATEGIES NOT FOUND:\n`;
  notFoundStrategies.forEach((strategy, idx) => {
    content += `${idx + 1}. ${strategy}\n`;
  });

  fs.writeFileSync(notFoundFile, content, 'utf8');
  console.log(`📄 Not found strategies saved to: ${notFoundFile}`);
};


module.exports = {
  asyncCompareSheetGroups,
  compareSheetTask,
  asyncReloadStrategy,
  getCurrentStats,     
  generateSyncStats,
  writeNotFoundLog     
};

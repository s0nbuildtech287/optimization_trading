const { db } = require("../config/db.js");
const { google } = require("googleapis");
const JWT = require("google-auth-library").JWT;
const { logError } = require("./errorLogService");
const googleSheet = require("../config/googleSheet.js");
const processQueue = require("../utils/processQueue");
const syncProgressTracker = require("../utils/syncProgressTracker");
const { DRIVE_SUMMARY_RULES } = require("../utils/constants");
// const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const authClients = require("../config/multiServiceAccounts");

const ALLOWED_COLUMNS = db.backtest.ALLOWED_COLUMNS;
const COLUMN_TYPES = db.backtest.COLUMN_TYPES;

//
const extractSpreadsheetId = (url) => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

const readLinksFromGoogleSheet = async (spreadsheetId) => {
  const sheets = googleSheet.getNextSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1",
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const nameIndex = headers.indexOf("tên file");
    const linkIndex = headers.indexOf("link sheet2");

    if (nameIndex === -1 || linkIndex === -1) {
      throw new Error('Không tìm thấy cột "Tên File" hoặc "Link Sheet2".');
    }

    return rows
      .slice(1)
      .map((row) => ({
        name: row[nameIndex]?.trim(),
        link: row[linkIndex]?.trim(),
      }))
      .filter((item) => item.name && item.link);
  } catch (err) {
    console.error("Lỗi đọc Google Sheet:", err.message);
    return [];
  }
};

const readAllLinksFromMultipleSheets = async (sheetURLs) => {
  const allLinks = [];

  for (const url of sheetURLs) {
    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) continue;

    const links = await readLinksFromGoogleSheet(spreadsheetId);
    allLinks.push(...links);
  }

  return allLinks;
};

const getSheetNameMap = async (sheetURLs) => {
  const links = await readAllLinksFromMultipleSheets(sheetURLs);
  return links.map((item) => ({
    sheetID: extractSpreadsheetId(item.link),
    sheetName: item.name,
  }));
};

const getSheetIDMapByName = async () => {
  const links = await readAllLinksFromMultipleSheets();
  return links.reduce((map, item) => {
    const id = extractSpreadsheetId(item.link);
    if (id && item.name) {
      map[item.name] = id;
    }
    return map;
  }, {});
};

const formatSheetData = (values, sheetName) => {
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);

  return rows.map((row) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] ?? null;
    });
    obj.Strategy_id = sheetName;
    return obj;
  });
};

const collectAndGroupSheets = async (sheetURLs) => {
  const allSheetMap = await getSheetNameMap(sheetURLs);
  const groupSize = Math.ceil(allSheetMap.length / authClients.length);

  const groups = authClients.map((_, i) => allSheetMap.slice(i * groupSize, (i + 1) * groupSize));
  return groups;
};

const collectAllSheets = async (sheetURLs) => {
  return await getSheetNameMap(sheetURLs);
};

const findSheetIdByName = async (sheetNameToFind) => {
  const map = await getSheetIDMapByName();
  return map[sheetNameToFind] || null;
};

const EXCEL_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.google-apps.spreadsheet",
]);

const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const summarySymbols = [...DRIVE_SUMMARY_RULES.VALID_SYMBOLS].sort((a, b) => b.length - a.length);
const strategyNamePattern = new RegExp(
  `^(\\d{3})(${summarySymbols.join("|")})(${DRIVE_SUMMARY_RULES.VALID_TIMEFRAMES.join("|")})(${DRIVE_SUMMARY_RULES.VALID_ORDER_TYPES.join("|")})$`,
);

const listDriveFolderItems = async (drive, folderId) => {
  const items = [];
  let pageToken = null;
  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000,
      pageToken,
    });
    items.push(...(response.data.files || []));
    pageToken = response.data.nextPageToken || null;
  } while (pageToken);
  return items;
};

const findSummarySymbol = (value) => {
  const upper = String(value || "").toUpperCase();
  return summarySymbols.find((symbol) => upper.includes(symbol)) || null;
};

const inspectSummaryFile = (file, pathName) => {
  const name = String(file.name || "").trim();
  const isGoogleSheet = file.mimeType === "application/vnd.google-apps.spreadsheet";
  const hasExcelExtension = /\.xlsx?$/i.test(name);
  const isExcel = isGoogleSheet || hasExcelExtension || EXCEL_MIME_TYPES.has(file.mimeType);
  const baseName = name.replace(/\.xlsx?$/i, "");
  let formatError = null;

  if (!isExcel) formatError = "Không phải file Excel hoặc Google Sheet";
  else if (baseName !== baseName.toUpperCase()) formatError = "Tên file phải viết hoa toàn bộ";
  else if (!strategyNamePattern.test(baseName)) {
    formatError = "Tên phải theo mẫu {3 số Bot ID}{Symbol}{H1|H4}{OB|OS}";
  }

  return {
    id: file.id,
    name,
    path: pathName,
    mimeType: file.mimeType,
    isExcel,
    isValidFormat: !formatError,
    formatError,
    normalizedName: baseName.toUpperCase(),
  };
};

const scanDriveAssetFolder = async (drive, folderId, pathPrefix, files, unexpectedItems) => {
  const items = await listDriveFolderItems(drive, folderId);
  for (const item of items) {
    const itemPath = `${pathPrefix}/${item.name}`;
    if (item.mimeType === DRIVE_FOLDER_MIME_TYPE) {
      unexpectedItems.push({
        id: item.id,
        name: item.name,
        path: itemPath,
        type: "NESTED_FOLDER",
        reason: "Folder con nằm bên trong folder tài sản",
      });
      await scanDriveAssetFolder(drive, item.id, itemPath, files, unexpectedItems);
      continue;
    }

    const inspected = inspectSummaryFile(item, itemPath);
    files.push(inspected);
    if (!inspected.isExcel) {
      unexpectedItems.push({
        id: item.id,
        name: item.name,
        path: itemPath,
        type: "NON_EXCEL_FILE",
        reason: inspected.formatError,
      });
    }
  }
};

const getDriveStructureSummary = async (folderUrl, syncId = null) => {
  const folderId = extractFolderId(folderUrl);
  if (!folderId) throw new Error("Link Google Drive folder không hợp lệ");

  let rootItems = null;
  let rootName = "Drive Root";
  let rootError = null;
  await processQueue.processQueueWithWorkers(
    [{ sheetName: "Drive Root", folderId, auth: authClients[0] }],
    async ({ auth }) => {
      try {
        const drive = google.drive({ version: "v3", auth });
        const [items, metadata] = await Promise.all([
          listDriveFolderItems(drive, folderId),
          drive.files.get({ fileId: folderId, fields: "name", supportsAllDrives: true }),
        ]);
        rootItems = items;
        rootName = metadata.data.name || rootName;
      } catch (error) {
        rootError = error;
        throw error;
      }
    },
    1,
  );
  if (rootError) throw rootError;

  const rootFolders = rootItems.filter((item) => item.mimeType === DRIVE_FOLDER_MIME_TYPE);
  const rootFiles = rootItems.filter((item) => item.mimeType !== DRIVE_FOLDER_MIME_TYPE);
  const directAssetMode = rootFolders.length === 0 && rootFiles.length > 0;
  const foldersToScan = directAssetMode
    ? [{ id: folderId, name: rootName, mimeType: DRIVE_FOLDER_MIME_TYPE, directFiles: rootFiles }]
    : rootFolders;
  const assets = [];
  const allFiles = [];
  const unexpectedItems = [];
  let processedFolders = 0;
  let scanError = null;

  if (!directAssetMode) {
    for (const file of rootFiles) {
      const inspected = inspectSummaryFile(file, `/[Drive Root]/${file.name}`);
      allFiles.push(inspected);
      unexpectedItems.push({
        id: file.id,
        name: file.name,
        path: inspected.path,
        type: "ROOT_FILE",
        reason: "File nằm trực tiếp tại Drive root",
      });
    }
  }

  const folderQueue = foldersToScan.map((folder, index) => ({
    ...folder,
    sheetName: folder.name,
    auth: authClients[index % authClients.length],
  }));
  await processQueue.processQueueWithWorkers(
    folderQueue,
    async ({ auth, ...folder }) => {
      try {
        const drive = google.drive({ version: "v3", auth });
        const symbol = findSummarySymbol(folder.name);
        const folderFiles = [];
        const folderUnexpected = [];
        if (!symbol) {
          folderUnexpected.push({
            id: folder.id,
            name: folder.name,
            path: `/[Drive Root]/${folder.name}`,
            type: "UNKNOWN_ASSET_FOLDER",
            reason: "Tên folder không chứa mã tài sản hợp lệ",
          });
        }

        if (folder.directFiles) {
          for (const file of folder.directFiles) {
            const inspected = inspectSummaryFile(file, `${folder.name}/${file.name}`);
            folderFiles.push(inspected);
            if (!inspected.isExcel) {
              folderUnexpected.push({
                id: file.id,
                name: file.name,
                path: inspected.path,
                type: "NON_EXCEL_FILE",
                reason: inspected.formatError,
              });
            }
          }
        } else {
          await scanDriveAssetFolder(drive, folder.id, folder.name, folderFiles, folderUnexpected);
        }

        assets.push({
          folderName: folder.name,
          symbol,
          isValidAsset: Boolean(symbol),
          totalFiles: folderFiles.length,
          excelFiles: folderFiles.filter((file) => file.isExcel).length,
          invalidFormatFiles: folderFiles.filter((file) => !file.isValidFormat).length,
          unexpectedItems: folderUnexpected.length,
          duplicateFiles: 0,
        });
        allFiles.push(...folderFiles);
        unexpectedItems.push(...folderUnexpected);

        processedFolders += 1;
        if (syncId) {
          await syncProgressTracker.updateSyncProgress(syncId, {
            totalFiles: Math.max(1, foldersToScan.length),
            processedFiles: processedFolders,
            successFiles: processedFolders,
            currentFile: folder.name,
          });
        }
      } catch (error) {
        scanError = scanError || error;
        throw error;
      }
    },
    Math.min(6, Math.max(1, foldersToScan.length)),
  );
  if (scanError) throw scanError;

  const filesByName = new Map();
  for (const file of allFiles) {
    if (!file.normalizedName) continue;
    if (!filesByName.has(file.normalizedName)) filesByName.set(file.normalizedName, []);
    filesByName.get(file.normalizedName).push(file);
  }
  const duplicateGroups = [...filesByName.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([name, files]) => ({
      name,
      count: files.length,
      duplicateCount: files.length - 1,
      paths: files.map((file) => file.path),
    }));
  const duplicatePaths = new Set(duplicateGroups.flatMap((group) => group.paths));
  for (const asset of assets) {
    asset.duplicateFiles = allFiles.filter(
      (file) => file.path.startsWith(`${asset.folderName}/`) && duplicatePaths.has(file.path),
    ).length;
  }

  assets.sort((a, b) => a.folderName.localeCompare(b.folderName));
  const invalidFiles = allFiles
    .filter((file) => !file.isValidFormat)
    .map(({ id, name, path: filePath, formatError }) => ({ id, name, path: filePath, reason: formatError }));

  return {
    totalFiles: allFiles.length,
    excelFiles: allFiles.filter((file) => file.isExcel).length,
    assetCount: assets.filter((asset) => asset.isValidAsset).length,
    folderCount: assets.length,
    invalidFormatCount: invalidFiles.length,
    duplicateNameCount: duplicateGroups.reduce((sum, group) => sum + group.duplicateCount, 0),
    duplicateGroupCount: duplicateGroups.length,
    unexpectedItemCount: unexpectedItems.length,
    assets,
    invalidFiles,
    duplicateGroups,
    unexpectedItems,
  };
};

// Drive layout: root -> asset folder -> Excel files.
// Only one folder level is valid; nested folders and non-Excel files are ignored.
const getAllFilesInDriveFolder = async (folderId, drive = null, isRoot = true) => {
  drive = drive || googleSheet.getNextDriveClient();
  let result = [];
  let pageToken = null;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 1000, // Google Drive API max 1000 page size
      pageToken: pageToken,
    });

    for (const file of res.data.files) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        if (isRoot) {
          // The direct children of the configured root are asset folders.
          const subFiles = await getAllFilesInDriveFolder(file.id, drive, false);
          result = result.concat(subFiles);
        }
        // A folder inside an asset folder is invalid for this layout and is skipped.
      } else if (EXCEL_MIME_TYPES.has(file.mimeType) && (
        file.mimeType === "application/vnd.google-apps.spreadsheet" || /\.xlsx?$/i.test(file.name)
      )) {
        // Support both a root folder (asset folders inside) and a URL that
        // points directly to one asset folder.
        result.push({
          sheetID: file.id,
          sheetName: file.name.replace(/\.xlsx$/i, ""),
        });
      }
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return result.length > 0 ? result : [];
};

const getAllFilesFromDriveFolderUrl = async (folderUrl) => {
  const match = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Không tìm thấy folderId trong đường link");
  const folderId = match[1];
  return await getAllFilesInDriveFolder(folderId);
};

/**
 * Extract folder ID from Google Drive URL
 * @param {string} url - Google Drive folder URL
 * @returns {string|null} - Folder ID or null
 */
const extractFolderId = (url) => {
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

/**
 * Get list of file names from Google Drive folder
 * @param {string} folderLink - Google Drive folder URL
 * @returns {Promise<string[]>} - Array of sheet names
 */
const getSheetNamesFromFolder = async (folderLink) => {
  const folderId = extractFolderId(folderLink);

  if (!folderId) {
    const error = new Error("Đường dẫn thư mục Google Drive không hợp lệ hoặc không đúng định dạng.");
    error.status = 400;
    throw error;
  }

  try {
    // Sử dụng googleSheet.getNextDriveClient() tự động rotate service accounts
    const drive = googleSheet.getNextDriveClient();

    // List all files in the folder (giống logic sync)
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType)",
      pageSize: 1000,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = response.data.files || [];

    console.log(`📁 Found ${files.length} files in folder ${folderId}`);

    // Lọc chỉ lấy Google Sheets và lấy tên
    const sheetNames = files.filter((file) => file.mimeType === "application/vnd.google-apps.spreadsheet").map((file) => file.name);

    console.log(`✓ Đã lấy ${sheetNames.length} sheet names từ folder ${folderId}`);

    return sheetNames;
  } catch (error) {
    console.error(`Lỗi khi quét folder:`, error.message);
    const googleStatus = Number(error.code || error.status);
    const msg = String(error.message || "");

    let status = 500;
    let userMessage = "Lỗi khi truy cập thư mục Google Drive.";

    if (googleStatus === 404 || msg.toLowerCase().includes("file not found") || msg.toLowerCase().includes("not found")) {
      status = 404;
      userMessage = "Đường dẫn thư mục Google Drive không hợp lệ hoặc không tồn tại.";
    } else if (googleStatus === 403 || msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("access denied")) {
      status = 403;
      userMessage = "Không có quyền truy cập thư mục Google Drive. Vui lòng kiểm tra quyền chia sẻ cho Service Account.";
    } else if (googleStatus === 400 || msg.toLowerCase().includes("invalid")) {
      status = 400;
      userMessage = "Đường dẫn thư mục Google Drive không hợp lệ.";
    }

    const appError = new Error(userMessage);
    appError.status = status;
    throw appError;
  }
};

/**
 * Get service account emails
 * @returns {string[]} - Array of service account emails
 */
const getServiceAccountEmails = () => {
  const fs = require("fs");
  const path = require("path");
  const saDir = path.join(__dirname, "../config/serviceAccounts");

  const emails = fs
    .readdirSync(saDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const key = require(path.join(saDir, file));
      return key.client_email;
    });

  return emails;
};

module.exports = {
  formatSheetData,
  collectAndGroupSheets,
  collectAllSheets,
  findSheetIdByName,
  readAllLinksFromMultipleSheets,
  getAllFilesFromDriveFolderUrl,
  getDriveStructureSummary,
  extractFolderId,
  getSheetNamesFromFolder,
  getServiceAccountEmails,
};

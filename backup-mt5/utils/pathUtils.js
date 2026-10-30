"use strict";
/**
 * Utilities for deriving MT5 terminal paths
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTerminalHash = extractTerminalHash;
exports.deriveMT5Paths = deriveMT5Paths;
exports.isValidMT5Terminal = isValidMT5Terminal;
exports.ensureDirectoriesExist = ensureDirectoriesExist;
const path = require("path");
const fs = require("fs");
/**
 * Extract terminal hash from terminal path
 * Expected: C:\Users\<User>\AppData\Roaming\MetaQuotes\Terminal\<HASH>
 */
function extractTerminalHash(basePath) {
    const parts = basePath.split(path.sep);
    return parts[parts.length - 1];
}
/**
 * Validate and derive MT5 paths from a terminal base directory
 */
function deriveMT5Paths(basePath) {
    const normalized = path.normalize(basePath);
    const hash = extractTerminalHash(normalized);
    return {
        base: normalized,
        journalLogs: path.join(normalized, 'Logs'),
        expertsLogs: path.join(normalized, 'MQL5', 'Logs'),
        targetFiles: path.join(normalized, 'MQL5', 'Files'),
        hash,
    };
}
/**
 * Check if a path looks like a valid MT5 terminal directory
 */
function isValidMT5Terminal(basePath) {
    // A valid MT5 terminal should have a folder name that looks like a hash (alphanumeric)
    const hash = extractTerminalHash(basePath);
    if (!hash || hash.length < 10 || !/^[a-zA-Z0-9]+$/.test(hash)) {
        return false;
    }
    // Optionally check for presence of key folders
    try {
        const mql5Path = path.join(basePath, 'MQL5');
        return fs.existsSync(mql5Path);
    }
    catch {
        return false;
    }
}
/**
 * Ensure all required directories exist
 */
function ensureDirectoriesExist(paths) {
    const dirsToCreate = [
        paths.journalLogs,
        paths.expertsLogs,
        paths.targetFiles,
    ];
    for (const dir of dirsToCreate) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

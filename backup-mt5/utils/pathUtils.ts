/**
 * Utilities for deriving MT5 terminal paths
 */

import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';

export interface MT5Paths {
  base: string;
  journalLogs: string;
  expertsLogs: string;
  targetFiles: string;
  hash: string;
  id: string;
}

/**
 * Extract terminal hash from terminal path
 * Expected: C:\Users\<User>\AppData\Roaming\MetaQuotes\Terminal\<HASH>
 */
export function extractTerminalHash(basePath: string): string {
  const parts = basePath.split(path.sep);
  return parts[parts.length - 1];
}

/**
 * Normalize a path for identity comparisons.
 * Uses an absolute, real path when possible so different spellings of the
 * same folder map to the same PM2 process name.
 */
export function normalizePathForIdentity(basePath: string): string {
  const normalized = path.normalize(basePath);

  try {
    return fs.realpathSync.native(normalized);
  } catch {
    return normalized;
  }
}

/**
 * Create a stable short identifier from a path.
 */
export function createStablePathId(basePath: string): string {
  const identityPath = normalizePathForIdentity(basePath);
  const canonical = process.platform === 'win32' ? identityPath.toLowerCase() : identityPath;
  return createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Create a stable short identifier from multiple string parts.
 */
export function createStableIdFromParts(...parts: string[]): string {
  const canonical = parts
    .map((part) => (process.platform === 'win32' ? part.toLowerCase() : part))
    .join('\u0000');
  return createHash('sha1').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Validate and derive MT5 paths from a terminal base directory
 */
export function deriveMT5Paths(basePath: string): MT5Paths {
  const normalized = path.normalize(basePath);
  const hash = extractTerminalHash(normalized);
  const id = createStablePathId(normalized);

  return {
    base: normalized,
    journalLogs: path.join(normalized, 'Logs'),
    expertsLogs: path.join(normalized, 'MQL5', 'Logs'),
    targetFiles: path.join(normalized, 'MQL5', 'Files'),
    hash,
    id,
  };
}

/**
 * Check if a path can be used as an MT5 terminal base directory.
 */
export function isValidMT5Terminal(basePath: string): boolean {
  const normalized = path.normalize(basePath);

  if (!fs.existsSync(normalized)) {
    return false;
  }

  try {
    const stats = fs.statSync(normalized);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Ensure all required directories exist
 */
export function ensureDirectoriesExist(paths: MT5Paths): void {
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

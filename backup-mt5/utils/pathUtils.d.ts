/**
 * Utilities for deriving MT5 terminal paths
 */
export interface MT5Paths {
    base: string;
    journalLogs: string;
    expertsLogs: string;
    targetFiles: string;
    hash: string;
}
/**
 * Extract terminal hash from terminal path
 * Expected: C:\Users\<User>\AppData\Roaming\MetaQuotes\Terminal\<HASH>
 */
export declare function extractTerminalHash(basePath: string): string;
/**
 * Validate and derive MT5 paths from a terminal base directory
 */
export declare function deriveMT5Paths(basePath: string): MT5Paths;
/**
 * Check if a path looks like a valid MT5 terminal directory
 */
export declare function isValidMT5Terminal(basePath: string): boolean;
/**
 * Ensure all required directories exist
 */
export declare function ensureDirectoriesExist(paths: MT5Paths): void;

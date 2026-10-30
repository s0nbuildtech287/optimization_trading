/**
 * PM2 process management utilities
 */
export interface PM2StartOptions {
    name: string;
    script: string;
    args?: string[];
    cwd?: string;
}
/**
 * Generate process name for a terminal
 */
export declare function getProcessName(terminalHash: string): string;
/**
 * Delete a process from pm2 (completely removes it)
 */
export declare function deleteProcessWithPM2(processName: string): Promise<void>;
/**
 * Kill all PM2 processes and reset daemon
 */
export declare function killPM2(): Promise<void>;
/**
 * Start a process with pm2
 */
export declare function startProcessWithPM2(options: PM2StartOptions): Promise<string>;
/**
 * Stop a process with pm2
 */
export declare function stopProcessWithPM2(processName: string): Promise<string>;
/**
 * Get list of running pm2 processes
 */
export declare function getRunningProcesses(): Promise<string>;
/**
 * Check if pm2 is installed and available
 */
export declare function checkPM2Available(): Promise<boolean>;
/**
 * Generate backup process name
 */
export declare function getBackupProcessName(terminalHash: string): string;
/**
 * Start a backup process with pm2
 */
export declare function startBackupProcessWithPM2(terminalHash: string, terminalPath: string, backupPath: string, intervalMinutes: number, cwd: string): Promise<string>;
/**
 * Stop a backup process with pm2
 */
export declare function stopBackupProcessWithPM2(terminalHash: string): Promise<void>;

"use strict";
/**
 * PM2 process management utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProcessName = getProcessName;
exports.deleteProcessWithPM2 = deleteProcessWithPM2;
exports.killPM2 = killPM2;
exports.startProcessWithPM2 = startProcessWithPM2;
exports.stopProcessWithPM2 = stopProcessWithPM2;
exports.getRunningProcesses = getRunningProcesses;
exports.checkPM2Available = checkPM2Available;
exports.getBackupProcessName = getBackupProcessName;
exports.startBackupProcessWithPM2 = startBackupProcessWithPM2;
exports.stopBackupProcessWithPM2 = stopBackupProcessWithPM2;
const child_process_1 = require("child_process");
const path = require("path");
/**
 * Generate process name for a terminal
 */
function getProcessName(terminalHash) {
    return `mt5-log-watcher-${terminalHash}`;
}
/**
 * Delete a process from pm2 (completely removes it)
 */
function deleteProcessWithPM2(processName) {
    return new Promise((resolve) => {
        const pm2Process = (0, child_process_1.spawn)('pm2', ['delete', processName], {
            stdio: 'pipe',
            shell: true,
        });
        pm2Process.on('close', () => {
            resolve();
        });
        pm2Process.on('error', () => {
            resolve();
        });
    });
}
/**
 * Kill all PM2 processes and reset daemon
 */
function killPM2() {
    return new Promise((resolve) => {
        const pm2Process = (0, child_process_1.spawn)('pm2', ['kill'], {
            stdio: 'pipe',
            shell: true,
        });
        pm2Process.on('close', () => {
            resolve();
        });
        pm2Process.on('error', () => {
            resolve();
        });
    });
}
/**
 * Start a process with pm2
 */
function startProcessWithPM2(options) {
    return new Promise(async (resolve, reject) => {
        try {
            // First, delete any existing process with the same name to prevent duplicates
            await deleteProcessWithPM2(options.name);
            // Wait a bit for pm2 to process the deletion
            await new Promise(r => setTimeout(r, 300));
            const args = ['start', options.script, '--name', options.name, '--force'];
            if (options.args && options.args.length > 0) {
                args.push('--');
                args.push(...options.args);
            }
            const pm2Process = (0, child_process_1.spawn)('pm2', args, {
                cwd: options.cwd,
                stdio: 'pipe',
                shell: true,
            });
            let output = '';
            let errorOutput = '';
            pm2Process.stdout?.on('data', (data) => {
                output += data.toString();
            });
            pm2Process.stderr?.on('data', (data) => {
                errorOutput += data.toString();
            });
            pm2Process.on('close', (code) => {
                if (code === 0) {
                    resolve(output);
                }
                else {
                    reject(new Error(`pm2 start failed: ${errorOutput || output}`));
                }
            });
            pm2Process.on('error', (err) => {
                reject(new Error(`Failed to start pm2: ${err.message}`));
            });
        }
        catch (err) {
            reject(err);
        }
    });
}
/**
 * Stop a process with pm2
 */
function stopProcessWithPM2(processName) {
    return new Promise((resolve) => {
        const pm2Process = (0, child_process_1.spawn)('pm2', ['stop', processName], {
            stdio: 'pipe',
            shell: true,
        });
        let output = '';
        let errorOutput = '';
        pm2Process.stdout?.on('data', (data) => {
            output += data.toString();
        });
        pm2Process.stderr?.on('data', (data) => {
            errorOutput += data.toString();
        });
        pm2Process.on('close', (code) => {
            // Always resolve, even on error - process might not exist
            resolve(output || errorOutput);
        });
        pm2Process.on('error', () => {
            // Silently handle errors
            resolve('');
        });
    });
}
/**
 * Get list of running pm2 processes
 */
function getRunningProcesses() {
    return new Promise((resolve, reject) => {
        const pm2Process = (0, child_process_1.spawn)('pm2', ['list', '--lines', '5'], {
            stdio: 'pipe',
            shell: true,
        });
        let output = '';
        pm2Process.stdout?.on('data', (data) => {
            output += data.toString();
        });
        pm2Process.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            }
            else {
                resolve(output);
            }
        });
        pm2Process.on('error', () => {
            resolve('');
        });
    });
}
/**
 * Check if pm2 is installed and available
 */
function checkPM2Available() {
    return new Promise((resolve) => {
        const pm2Process = (0, child_process_1.spawn)('pm2', ['--version'], {
            stdio: 'pipe',
            shell: true,
        });
        pm2Process.on('close', (code) => {
            resolve(code === 0);
        });
        pm2Process.on('error', () => {
            resolve(false);
        });
    });
}
/**
 * Generate backup process name
 */
function getBackupProcessName(terminalHash) {
    return `mt5-backup-${terminalHash}`;
}
/**
 * Start a backup process with pm2
 */
function startBackupProcessWithPM2(terminalHash, terminalPath, backupPath, intervalMinutes, cwd) {
    return new Promise(async (resolve, reject) => {
        try {
            const processName = getBackupProcessName(terminalHash);
            // First, delete any existing backup process with the same name
            await deleteProcessWithPM2(processName);
            // Wait a bit for pm2 to process the deletion
            await new Promise(r => setTimeout(r, 300));
            const backupScript = path.join(cwd, 'backend', 'backup.js');
            const configArg = JSON.stringify({
                terminalPath,
                backupPath,
                intervalMinutes,
            });
            const args = [
                'start',
                backupScript,
                '--name',
                processName,
                '--force',
                '--',
                configArg,
            ];
            const pm2Process = (0, child_process_1.spawn)('pm2', args, {
                stdio: 'pipe',
                shell: true,
            });
            let output = '';
            pm2Process.stdout?.on('data', (data) => {
                output += data.toString();
            });
            pm2Process.stderr?.on('data', (data) => {
                output += data.toString();
            });
            pm2Process.on('close', (code) => {
                resolve(processName);
            });
            pm2Process.on('error', (error) => {
                reject(error);
            });
        }
        catch (error) {
            reject(error);
        }
    });
}
/**
 * Stop a backup process with pm2
 */
function stopBackupProcessWithPM2(terminalHash) {
    return new Promise((resolve) => {
        const processName = getBackupProcessName(terminalHash);
        const pm2Process = (0, child_process_1.spawn)('pm2', ['stop', processName], {
            stdio: 'pipe',
            shell: true,
        });
        pm2Process.on('close', () => {
            resolve();
        });
        pm2Process.on('error', () => {
            resolve();
        });
    });
}

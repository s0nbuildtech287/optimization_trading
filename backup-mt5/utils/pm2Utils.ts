/**
 * PM2 process management utilities
 * Fixed for packaged Electron apps
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface PM2StartOptions {
  name: string;
  script: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * Get the correct PM2 executable path
 * In production (packaged app), we need to use the global pm2 installation
 */
function getPM2Command(): string {
  // For Windows, we need to use the full path to pm2.cmd
  if (process.platform === 'win32') {
    // Try npm global path
    const npmGlobalPath = path.join(process.env.APPDATA || '', 'npm');
    const pm2CmdPath = path.join(npmGlobalPath, 'pm2.cmd');

    if (fs.existsSync(pm2CmdPath)) {
      return pm2CmdPath;
    }

    // Try Program Files npm
    const programFilesNpm = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'pm2.cmd');
    if (fs.existsSync(programFilesNpm)) {
      return programFilesNpm;
    }

    // Fallback to just 'pm2' and let system PATH resolve it
    return 'pm2';
  }

  return 'pm2';
}

/**
 * Spawn PM2 process with proper configuration for packaged apps
 */
function spawnPM2(args: string[], options: any = {}) {
  const pm2Command = getPM2Command();

  return spawn(pm2Command, args, {
    ...options,
    shell: true,
    windowsHide: true,
    detached: false, // Keep attached to parent for proper cleanup
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

/**
 * Generate process name for a terminal
 */
export function getProcessName(terminalHash: string): string {
  return `mt5-log-watcher-${terminalHash}`;
}

/**
 * Delete a process from pm2 (completely removes it)
 */
export function deleteProcessWithPM2(processName: string): Promise<void> {
  return new Promise((resolve) => {
    const pm2Process = spawnPM2(['delete', processName], {
      stdio: 'pipe',
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
export function killPM2(): Promise<void> {
  return new Promise((resolve) => {
    const pm2Process = spawnPM2(['kill'], {
      stdio: 'pipe',
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
export function startProcessWithPM2(options: PM2StartOptions): Promise<string> {
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

      const pm2Process = spawnPM2(args, {
        cwd: options.cwd,
        env: options.env,
        stdio: 'pipe',
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
        } else {
          reject(new Error(`pm2 start failed: ${errorOutput || output}`));
        }
      });

      pm2Process.on('error', (err) => {
        reject(new Error(`Failed to start pm2: ${err.message}`));
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Stop a process with pm2
 */
export function stopProcessWithPM2(processName: string): Promise<string> {
  return new Promise((resolve) => {
    const pm2Process = spawnPM2(['stop', processName], {
      stdio: 'pipe',
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

// export function getRunningProcesses(): Promise<string> {
//   return new Promise((resolve, reject) => {
//     const pm2Process = spawnPM2(['list', '--lines', '5'], {
//       stdio: 'pipe',
//     });

//     let output = '';

//     pm2Process.stdout?.on('data', (data) => {
//       output += data.toString();
//     });

//     pm2Process.on('close', (code) => {
//       if (code === 0) {
//         resolve(output);
//       } else {
//         resolve(output);
//       }
//     });

//     pm2Process.on('error', () => {
//       resolve('');
//     });
//   });
// }

/**
 * Get list of running pm2 processes
 */
export function getRunningProcesses(): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Use exec (async) instead of execSync
      const { exec } = require('child_process');
      const pm2Command = getPM2Command();

      // Execute pm2 jlist and capture output
      exec(`"${pm2Command}" jlist`, {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 1024 * 1024, // 1MB buffer
        timeout: 5000, // 5 second timeout
      }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          // PM2 might return non-zero exit code with warnings, but still have output
          if (stdout) {
            resolve(stdout);
          } else if (stderr) {
            resolve(stderr);
          } else {
            resolve('[]'); // Return empty JSON array
          }
        } else {
          resolve(stdout || '[]');
        }
      });
    } catch (error: any) {
      resolve('[]'); // Return empty JSON array on error
    }
  });
}

/**
 * Check if pm2 is installed and available
 */
export function checkPM2Available(): Promise<boolean> {
  return new Promise((resolve) => {
    const pm2Process = spawnPM2(['--version'], {
      stdio: 'pipe',
    });

    pm2Process.on('close', (code) => {
      resolve(code === 0);
    });

    pm2Process.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Folder Backup Service
 * Watches a folder and backs it up to a destination folder at specified intervals
 * 
 * Usage: node folderBackup.js <source-folder> <destination-folder> <interval-in-seconds>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { createHash } from 'crypto';

interface BackupState {
  lastBackupTime: number;
  filesCount: number;
  totalSize: number;
}

interface BackupTaskConfig {
  id?: string;
  sourcePath: string;
  destPath: string;
  intervalSeconds: number;
  enabled?: boolean;
}

interface BackupGroupConfig {
  tasks: BackupTaskConfig[];
}

function sanitizeFolderName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim().replace(/[. ]+$/g, '');
}

function extractWindowsUserName(sourcePath: string): string | null {
  const normalized = path.normalize(sourcePath);
  const parts = normalized.split(path.sep);
  const usersIndex = parts.findIndex((part) => part.toLowerCase() === 'users');
  if (usersIndex >= 0 && parts.length > usersIndex + 1) {
    const user = parts[usersIndex + 1];
    return user ? sanitizeFolderName(user) : null;
  }
  return null;
}

function createPathToken(sourcePath: string): string {
  return createHash('sha1').update(path.normalize(sourcePath).toLowerCase()).digest('hex').slice(0, 8);
}

function getBackupFolderName(sourcePath: string): string {
  const folderName = sanitizeFolderName(path.basename(sourcePath));
  const userName = extractWindowsUserName(sourcePath);
  return userName ? `${folderName}_${userName}` : `${folderName}_${createPathToken(sourcePath)}`;
}

class FolderBackupService {
  private sourcePath: string;
  private destPath: string;
  private intervalSeconds: number;
  private backupFolderName: string;
  private targetPath: string;
  private statePath: string;
  private state: BackupState;
  private watcher?: chokidar.FSWatcher;
  private backupTimer?: NodeJS.Timeout;
  private isBackingUp: boolean = false;

  constructor(sourcePath: string, destPath: string, intervalSeconds: number) {
    this.sourcePath = sourcePath;
    this.destPath = destPath;
    this.intervalSeconds = intervalSeconds;
    this.backupFolderName = getBackupFolderName(sourcePath);
    this.targetPath = path.join(destPath, this.backupFolderName);
    this.statePath = path.join(this.targetPath, '.backup-state.json');
    this.state = this.loadState();

    this.ensureDirectories();
    this.logMessage(`Folder Backup Service initialized`);
    this.logMessage(`Source: ${sourcePath}`);
    this.logMessage(`Destination: ${destPath}`);
    this.logMessage(`Backup folder: ${this.backupFolderName}`);
    this.logMessage(`Interval: ${intervalSeconds} seconds`);
  }

  private logMessage(msg: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [FolderBackup] ${msg}`);
  }

  private ensureDirectories(): void {
    const dirs = [this.sourcePath, this.destPath, this.targetPath];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          this.logMessage(`Created directory: ${dir}`);
        } catch (err) {
          this.logMessage(`Failed to create directory ${dir}: ${err}`);
        }
      }
    }
  }

  private loadState(): BackupState {
    try {
      if (fs.existsSync(this.statePath)) {
        const data = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      this.logMessage(`Failed to load state: ${err}`);
    }
    return { lastBackupTime: 0, filesCount: 0, totalSize: 0 };
  }

  private saveState(): void {
    try {
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (err) {
      this.logMessage(`Failed to save state: ${err}`);
    }
  }

  /**
   * Copy a file from source to destination, creating directories as needed
   */
  private copyFile(sourceFile: string, destFile: string): void {
    try {
      const destDir = path.dirname(destFile);
      
      // Create destination directory if it doesn't exist
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy file (overwrite if exists)
      fs.copyFileSync(sourceFile, destFile);
    } catch (err) {
      this.logMessage(`Failed to copy file ${sourceFile}: ${err}`);
    }
  }

  /**
   * Recursively copy all files from source to destination
   */
  private copyDirectoryRecursive(source: string, dest: string): number {
    let copiedCount = 0;

    try {
      const items = fs.readdirSync(source, { withFileTypes: true });

      for (const item of items) {
        const sourcePath = path.join(source, item.name);
        const destPath = path.join(dest, item.name);

        if (item.isDirectory()) {
          // Recursively copy subdirectory
          copiedCount += this.copyDirectoryRecursive(sourcePath, destPath);
        } else {
          // Copy file
          this.copyFile(sourcePath, destPath);
          copiedCount++;
        }
      }
    } catch (err) {
      this.logMessage(`Error reading directory ${source}: ${err}`);
    }

    return copiedCount;
  }

  /**
   * Calculate total size of a directory
   */
  private calculateDirSize(dir: string): number {
    let size = 0;

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const itemPath = path.join(dir, item.name);

        if (item.isDirectory()) {
          size += this.calculateDirSize(itemPath);
        } else {
          const stats = fs.statSync(itemPath);
          size += stats.size;
        }
      }
    } catch (err) {
      this.logMessage(`Error calculating directory size: ${err}`);
    }

    return size;
  }

  /**
   * Perform full backup
   */
  private async performBackup(): Promise<void> {
    if (this.isBackingUp) {
      this.logMessage('Backup already in progress, skipping...');
      return;
    }

    if (!fs.existsSync(this.sourcePath)) {
      this.logMessage(`Source path does not exist: ${this.sourcePath}`);
      return;
    }

    this.isBackingUp = true;
    const startTime = Date.now();

    try {
      this.logMessage('Starting backup...');

      // Create backup with folder name (e.g., copy C:\Source to C:\Backup\Source)
      const copiedCount = this.copyDirectoryRecursive(this.sourcePath, this.targetPath);

      // Update state
      this.state.lastBackupTime = Date.now();
      this.state.filesCount = copiedCount;
      this.state.totalSize = this.calculateDirSize(this.targetPath);
      this.saveState();

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logMessage(
        `Backup completed in ${duration}s - Copied ${copiedCount} files, Total size: ${this.formatBytes(this.state.totalSize)}`
      );
    } catch (err) {
      this.logMessage(`Backup failed: ${err}`);
    } finally {
      this.isBackingUp = false;
    }
  }

  /**
   * Format bytes to human readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Start the backup service
   */
  public start(): void {
    // Perform initial backup
    this.performBackup();

    // Set up periodic backups
    this.backupTimer = setInterval(() => {
      this.performBackup();
    }, this.intervalSeconds * 1000);

    // Also watch for file changes to trigger immediate backups
    this.watcher = chokidar.watch(this.sourcePath, {
      ignored: /(^|[\/\\])\.|node_modules/,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', () => {
        // File was added, it will be picked up in next scheduled backup
        this.logMessage('File added, will be included in next backup');
      })
      .on('change', () => {
        // File was changed, it will be picked up in next scheduled backup
        this.logMessage('File changed, will be included in next backup');
      })
      .on('unlink', () => {
        // File was deleted
        this.logMessage('File deleted in source');
      })
      .on('error', (error) => {
        this.logMessage(`Watcher error: ${error}`);
      });

    this.logMessage('Backup service started');
  }

  /**
   * Stop the backup service
   */
  public stop(): void {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = undefined;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }

    this.logMessage('Backup service stopped');
  }

  /**
   * Get current state
   */
  public getState(): BackupState {
    return { ...this.state };
  }
}

class FolderBackupGroup {
  private configPath: string;
  private services = new Map<string, FolderBackupService>();
  private servicePaths = new Map<string, BackupTaskConfig>();
  private configWatcher?: chokidar.FSWatcher;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  private logMessage(msg: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [FolderBackupGroup] ${msg}`);
  }

  private getTaskKey(task: BackupTaskConfig): string {
    const normalized = [
      path.normalize(String(task.sourcePath || '').trim()).toLowerCase(),
      path.normalize(String(task.destPath || '').trim()).toLowerCase(),
      String(task.intervalSeconds || 0),
    ].join('\u0000');
    return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
  }

  private loadConfig(): BackupGroupConfig {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as any;
      const tasksSource = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.tasks)
          ? parsed.tasks
          : Array.isArray(parsed?.backups)
            ? parsed.backups
            : [];

      return {
        tasks: tasksSource
          .map((task: any) => {
            const rawSourcePath = String(task?.sourcePath || '').trim();
            const rawDestPath = String(task?.destPath || '').trim();
            if (!rawSourcePath || !rawDestPath) return null;

            return {
              id: String(task?.id || '').trim() || undefined,
              sourcePath: path.normalize(rawSourcePath),
              destPath: path.normalize(rawDestPath),
              intervalSeconds: Math.max(1, parseInt(String(task?.intervalSeconds || '0'), 10) || 0),
              enabled: task?.enabled !== false,
            };
          })
          .filter((task: BackupTaskConfig | null): task is BackupTaskConfig => !!task && !!task.sourcePath && !!task.destPath && task.intervalSeconds > 0),
      };
    } catch (err) {
      this.logMessage(`Failed to load group config: ${err}`);
      return { tasks: [] };
    }
  }

  private syncServices(): void {
    const config = this.loadConfig();
    const desired = new Map<string, BackupTaskConfig>();

    for (const task of config.tasks) {
      if (task.enabled === false) continue;
      desired.set(this.getTaskKey(task), task);
    }

    for (const [key, service] of this.services.entries()) {
      const desiredTask = desired.get(key);
      const currentTask = this.servicePaths.get(key);
      if (
        !desiredTask ||
        !currentTask ||
        desiredTask.sourcePath !== currentTask.sourcePath ||
        desiredTask.destPath !== currentTask.destPath ||
        desiredTask.intervalSeconds !== currentTask.intervalSeconds
      ) {
        service.stop();
        this.services.delete(key);
        this.servicePaths.delete(key);
        this.logMessage(`Stopped backup task: ${currentTask?.sourcePath || key}`);
      }
    }

    for (const [key, task] of desired.entries()) {
      if (this.services.has(key)) continue;
      const service = new FolderBackupService(task.sourcePath, task.destPath, task.intervalSeconds);
      service.start();
      this.services.set(key, service);
      this.servicePaths.set(key, task);
      this.logMessage(`Started backup task: ${path.basename(task.sourcePath)} -> ${task.destPath}`);
    }

    this.logMessage(`Group synced. Active backup tasks: ${this.services.size}`);
  }

  public start(): void {
    this.configWatcher = chokidar.watch(this.configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.configWatcher
      .on('add', () => this.syncServices())
      .on('change', () => this.syncServices())
      .on('error', (err) => this.logMessage(`Config watcher error: ${err}`));

    this.syncServices();
    this.logMessage('Folder Backup group started successfully');
  }

  public stop(): void {
    this.configWatcher?.close();
    this.configWatcher = undefined;
    for (const service of this.services.values()) {
      service.stop();
    }
    this.services.clear();
    this.servicePaths.clear();
    this.logMessage('Folder Backup group stopped');
  }
}

// Main entry point
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node folderBackup.js <source-folder> <destination-folder> <interval-in-seconds | config.json>');
  process.exit(1);
}

const [firstArg, secondArg, thirdArg] = args;
const isGroupConfig = args.length === 1 && fs.existsSync(firstArg) && fs.statSync(firstArg).isFile() && path.extname(firstArg).toLowerCase() === '.json';

if (isGroupConfig) {
  const backupGroup = new FolderBackupGroup(firstArg);
  backupGroup.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down backup group...');
    backupGroup.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Terminating backup group...');
    backupGroup.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    backupGroup.stop();
    process.exit(1);
  });
} else {
  if (args.length < 3) {
    console.error('Usage: node folderBackup.js <source-folder> <destination-folder> <interval-in-seconds>');
    process.exit(1);
  }

  const sourceFolder = firstArg;
  const destFolder = secondArg;
  const interval = parseInt(thirdArg, 10);

  if (isNaN(interval) || interval < 1) {
    console.error('Interval must be a positive number');
    process.exit(1);
  }

  const backup = new FolderBackupService(sourceFolder, destFolder, interval);
  backup.start();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down backup service...');
    backup.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Terminating backup service...');
    backup.stop();
    process.exit(0);
  });
}

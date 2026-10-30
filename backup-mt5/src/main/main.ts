/**
 * Electron Main Process
 * Handles window management, IPC, and pm2 process control
 */

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import { spawn, spawnSync } from 'child_process';
import * as os from 'os';
import {
  startProcessWithPM2,
  stopProcessWithPM2,
  deleteProcessWithPM2,
  getProcessName,
  checkPM2Available,
  getRunningProcesses,
} from '../../utils/pm2Utils';
import {
  deriveMT5Paths,
  isValidMT5Terminal,
  ensureDirectoriesExist,
  extractTerminalHash,
  createStablePathId,
  createStableIdFromParts,
} from '../../utils/pathUtils';
import { sendMonitorDisconnect } from '../../utils/systemMonitorApi';
import { Mt5WorkerManager } from './mt5WorkerManager';

const projectRoot = path.join(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env') });

let mainWindow: BrowserWindow | null = null;
let mt5WorkerManager: Mt5WorkerManager | null = null;
let mt5WorkerShutdownStarted = false;
let mt5WorkerShutdownComplete = false;
const isDev = !app.isPackaged;
const isMac = process.platform === 'darwin';

function createWindow() {
  if (mainWindow !== null) return;

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
  });

  const startUrl = url.format({
    pathname: path.join(__dirname, '../renderer/index.html'),
    protocol: 'file:',
    slashes: true,
  });

  mainWindow.loadURL(startUrl);

  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  ensurePawnIoInstalled();
  mt5WorkerManager = new Mt5WorkerManager(
    app.getPath('userData'),
    getBackendScriptPath('mt5Worker'),
    getPythonExecutable(),
  );
  mt5WorkerManager.setListeners(
    () => mainWindow?.webContents.send('mt5-workers:state', mt5WorkerManager?.getSnapshot()),
    (workerId, line) => mainWindow?.webContents.send('mt5-workers:log', { workerId, line }),
  );
  createWindow();
  void mt5WorkerManager.startAutoWorkers();

  try {
    const config = loadWatcherGroupConfig();
    await syncWatcherGroupProcess(config, false);
    console.log('[watcher-upload] bootstrap sync completed');
  } catch (error) {
    console.warn('[watcher-upload] bootstrap sync failed:', error);
  }
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

app.on('before-quit', (event) => {
  if (!mt5WorkerManager || mt5WorkerShutdownComplete) return;
  event.preventDefault();
  if (mt5WorkerShutdownStarted) return;
  mt5WorkerShutdownStarted = true;
  void mt5WorkerManager.stopAll().finally(() => {
    mt5WorkerShutdownComplete = true;
    app.quit();
  });
});

// ──────────────────────────────
// Helper paths
// ──────────────────────────────
function getResourcePath(relativePath: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, relativePath) : path.join(__dirname, relativePath);
}

/** Install the bundled hardware-monitor driver when it is missing. */
function ensurePawnIoInstalled(): void {
  if (process.platform !== 'win32') return;

  const serviceCheck = spawnSync('sc.exe', ['query', 'PawnIO'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  if (serviceCheck.status === 0) {
    console.log('[SystemMonitor] PawnIO service is installed');
    return;
  }

  const installer = app.isPackaged
    ? path.join(process.resourcesPath, 'PawnIO_setup.exe')
    : path.join(__dirname, '../../assets/PawnIO_setup.exe');
  if (!fs.existsSync(installer)) {
    console.warn(`[SystemMonitor] PawnIO installer not found: ${installer}`);
    return;
  }

  console.log('[SystemMonitor] PawnIO service not found; installing bundled driver...');
  const result = spawnSync(installer, ['-install', '-silent'], {
    cwd: path.dirname(installer),
    windowsHide: true,
    stdio: 'ignore',
  });
  if (result.status === 0) {
    console.log('[SystemMonitor] PawnIO installed successfully');
  } else {
    console.warn(`[SystemMonitor] PawnIO installation returned code ${result.status}`);
  }
}

function getBackendScriptPath(scriptName: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'backend', scriptName) : path.join(__dirname, '../../backend', scriptName);
}

function getPythonExecutable(): string {
  const projectRoot = path.join(__dirname, '../..');
  const backendRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(projectRoot, 'backend');
  const candidates = [
    os.platform() === 'win32'
      ? path.join(backendRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(backendRoot, '.venv', 'bin', 'python'),
    os.platform() === 'win32'
      ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(projectRoot, '.venv', 'bin', 'python'),
    process.env.PYTHON || '',
    process.env.PYTHON3 || '',
    'python',
    'python3',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (result.status === 0) return candidate;
  }

  return os.platform() === 'win32'
    ? path.join(backendRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(backendRoot, '.venv', 'bin', 'python');
}

function requireMt5WorkerManager(): Mt5WorkerManager {
  if (!mt5WorkerManager) throw new Error('MT5 Worker manager is not ready');
  return mt5WorkerManager;
}

ipcMain.handle('mt5-workers:get-snapshot', () => requireMt5WorkerManager().getSnapshot());
ipcMain.handle('mt5-workers:get-logs', (_event, workerId: string) => requireMt5WorkerManager().getLogs(workerId));
ipcMain.handle('mt5-workers:clear-logs', (_event, workerId: string) => requireMt5WorkerManager().clearLogs(workerId));
ipcMain.handle('mt5-workers:save-connection', (_event, connection) => requireMt5WorkerManager().saveConnection(connection));
ipcMain.handle('mt5-workers:test-server', (_event, serverUrl?: string) => requireMt5WorkerManager().testServer(serverUrl));
ipcMain.handle('mt5-workers:verify-identity', (_event, serverUrl?: string, apiKey?: string) => requireMt5WorkerManager().verifyIdentity(serverUrl, apiKey));
ipcMain.handle('mt5-workers:create', (_event, worker = {}) => requireMt5WorkerManager().createWorker(worker));
ipcMain.handle('mt5-workers:update', (_event, workerId: string, updates) => requireMt5WorkerManager().updateWorker(workerId, updates));
ipcMain.handle('mt5-workers:delete', (_event, workerId: string) => requireMt5WorkerManager().deleteWorker(workerId));
ipcMain.handle('mt5-workers:start', (_event, workerId: string) => requireMt5WorkerManager().startWorker(workerId));
ipcMain.handle('mt5-workers:stop', (_event, workerId: string) => requireMt5WorkerManager().stopWorker(workerId));
ipcMain.handle('mt5-workers:restart', (_event, workerId: string) => requireMt5WorkerManager().restartWorker(workerId));
ipcMain.handle('mt5-workers:start-all', () => requireMt5WorkerManager().startAll());
ipcMain.handle('mt5-workers:stop-all', () => requireMt5WorkerManager().stopAll());

ipcMain.handle('mt5-workers:select-terminal', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select terminal64.exe',
    properties: ['openFile'],
    filters: [{ name: 'MetaTrader 5 Terminal', extensions: ['exe'] }],
  });
  return !result.canceled && result.filePaths.length > 0 ? result.filePaths[0] : null;
});

ipcMain.handle('mt5-workers:select-directory', async (_event, title?: string, defaultPath?: string) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: title || 'Select Directory',
    defaultPath: defaultPath || undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  return !result.canceled && result.filePaths.length > 0 ? result.filePaths[0] : null;
});

interface Mt5RunningProcess {
  pid: number;
  executablePath: string;
  commandLine: string;
  sessionId?: number;
}

type Mt5SlotConfig = {
  id?: string;
  name: string;
  path: string;
};

type Mt5RunWatcherConfig = {
  slots: Mt5SlotConfig[];
  intervalSeconds?: number;
  password?: string;
};

type Mt5HistoryAccountConfig = {
  name?: string;
  terminal_path: string;
  login?: number | string;
  server: string;
  password?: string;
  api_key?: string;
  monitor_id?: string;
  symbol?: string;
  start_date?: string;
  server_url?: string;
  interval_seconds?: number | string;
  history_url: string;
  closed_positions_url: string;
};

type Mt5HistorySyncConfig = {
  interval_seconds: number;
  state_dir: string;
  accounts: Mt5HistoryAccountConfig[];
};

const MT5_RUN_WATCHER_PROCESS_NAME = 'mt5-auto-restart';

function getMt5RunWatcherConfigPath(): string {
  return 'C:\\Users\\ADMIN\\Desktop\\mt5-auto-restart-config.txt';
}

function writeMt5RunWatcherConfig(slots: Mt5SlotConfig[], intervalSeconds = 10, password = ''): string {
  const configPath = getMt5RunWatcherConfigPath();
  const config: Mt5RunWatcherConfig = {
    slots: Array.isArray(slots)
      ? slots.map((slot) => ({
        id: slot?.id,
        name: String(slot?.name || '').trim(),
        path: String(slot?.path || '').trim(),
      }))
      : [],
    intervalSeconds: Math.max(10, intervalSeconds || 10),
    password,
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return configPath;
}

function getMt5RunWatcherScriptPath(): string {
  return getBackendScriptPath('mt5RunWatcher.js');
}

function runPowerShell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    ps.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    ps.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    ps.on('error', reject);
    ps.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || stdout || `PowerShell exited with code ${code}`));
      }
    });
  });
}

function normalizeWindowsPathForMatch(value: string): string {
  return path.normalize(value).replace(/\//g, '\\').toLowerCase();
}

function processMatchesTerminal(processInfo: Mt5RunningProcess, terminalPath: string): boolean {
  const normalizedTerminalPath = normalizeWindowsPathForMatch(terminalPath);
  const normalizedExePath = normalizeWindowsPathForMatch(path.join(terminalPath, 'terminal64.exe'));
  const commandLine = (processInfo.commandLine || '').toLowerCase();
  const executablePath = normalizeWindowsPathForMatch(processInfo.executablePath || '');

  return (
    executablePath === normalizedExePath ||
    executablePath.startsWith(normalizedTerminalPath) ||
    commandLine.includes(normalizedTerminalPath) ||
    commandLine.includes(normalizedExePath)
  );
}

async function scanMt5RunningProcesses(): Promise<Mt5RunningProcess[]> {
  const psCommand = `
    $items = Get-CimInstance Win32_Process -Filter "Name='terminal64.exe'" |
      Select-Object ProcessId, ExecutablePath, CommandLine, SessionId;
    if ($null -eq $items) {
      @() | ConvertTo-Json -Compress
    } else {
      $items | ConvertTo-Json -Compress
    }
  `.trim().replace(/\s+/g, ' ');

  const output = await runPowerShell(psCommand);
  if (!output.trim()) return [];

  const parsed = JSON.parse(output) as any[] | any;
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items
    .filter((item) => !!item && typeof item.ProcessId === 'number')
    .map((item) => ({
      pid: item.ProcessId,
      executablePath: item.ExecutablePath || '',
      commandLine: item.CommandLine || '',
      sessionId: item.SessionId,
    }));
}

// ──────────────────────────────
// Legacy terminals / backup
// ──────────────────────────────
function getTerminalBasePathFromProcess(processInfo: Mt5RunningProcess): string | null {
  const executablePath = String(processInfo.executablePath || '').trim();
  if (executablePath) {
    const normalizedExe = path.normalize(executablePath);
    if (path.basename(normalizedExe).toLowerCase() === 'terminal64.exe') {
      return path.dirname(normalizedExe);
    }
  }

  const commandLine = String(processInfo.commandLine || '').trim();
  if (!commandLine) return null;

  const normalizedCommandLine = commandLine.replace(/"/g, '').replace(/\//g, '\\');
  const exeMatch = normalizedCommandLine.match(/([a-zA-Z]:\\.*?\\terminal64\.exe)/i);
  if (exeMatch?.[1]) {
    return path.dirname(path.normalize(exeMatch[1]));
  }

  const folderMatch = normalizedCommandLine.match(/([a-zA-Z]:\\.*?)(?:\\terminal64\.exe)?$/i);
  if (folderMatch?.[1]) {
    const candidate = path.normalize(folderMatch[1]);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function autoEnableRunningWatcherTerminals(config: WatcherGroupConfig): Promise<WatcherGroupConfig> {
  try {
    const processes = await scanMt5RunningProcesses();
    if (processes.length === 0) return config;

    const nextSlots = [...config.slots];
    const slotIndexByKey = new Map<string, number>();
    nextSlots.forEach((slot, index) => {
      slotIndexByKey.set(getWatcherSlotKey(slot.path), index);
    });

    let changed = false;

    for (const processInfo of processes) {
      const terminalPath = getTerminalBasePathFromProcess(processInfo);
      if (!terminalPath) continue;
      if (!isValidMT5Terminal(terminalPath)) continue;

      const normalizedTerminalPath = path.normalize(terminalPath);
      const key = getWatcherSlotKey(normalizedTerminalPath);
      const existingIndex = slotIndexByKey.get(key);
      const fallbackName = path.basename(normalizedTerminalPath) || key;

      if (existingIndex === undefined) {
        nextSlots.push({
          id: key,
          name: fallbackName,
          path: normalizedTerminalPath,
          enabled: true,
        });
        slotIndexByKey.set(key, nextSlots.length - 1);
        changed = true;
        console.log(`[watcher-upload] auto-added running terminal ${fallbackName} -> ${normalizedTerminalPath}`);
        continue;
      }

      const existing = nextSlots[existingIndex];
      if (existing.enabled === false || path.normalize(existing.path) !== normalizedTerminalPath || !String(existing.name || '').trim()) {
        nextSlots[existingIndex] = {
          ...existing,
          id: existing.id || key,
          name: existing.name || fallbackName,
          path: normalizedTerminalPath,
          enabled: true,
        };
        changed = true;
        console.log(`[watcher-upload] auto-enabled running terminal ${fallbackName} -> ${normalizedTerminalPath}`);
      }
    }

    if (!changed) return config;

    const nextConfig: WatcherGroupConfig = {
      slots: nextSlots,
      upload: config.upload,
    };
    saveWatcherGroupConfig(nextConfig);
    return nextConfig;
  } catch (error) {
    console.warn('[watcher-upload] failed to auto-enable running terminals:', error);
    return config;
  }
}

ipcMain.handle('select-terminal-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select MT5 Terminal Folder',
    defaultPath: path.join(process.env.APPDATA || '', 'MetaQuotes/Terminal'),
    properties: ['openDirectory'],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];
    if (isValidMT5Terminal(selectedPath)) return selectedPath;
    await dialog.showErrorBox('Invalid MT5 Terminal', 'Selected folder does not appear to be a valid MT5 terminal folder.');
  }
  return null;
});

ipcMain.handle('start-process', async (_event, terminalPath: string) => {
  try {
    if (!isValidMT5Terminal(terminalPath)) return { success: false, message: 'Invalid MT5 terminal path' };
    const normalizedTerminalPath = path.normalize(terminalPath).toLowerCase();
    const existingConfig = loadWatcherGroupConfig();
    const isNewTerminal = !existingConfig.slots.some((slot) => path.normalize(slot.path).toLowerCase() === normalizedTerminalPath);
    const paths = deriveMT5Paths(terminalPath);
    ensureDirectoriesExist(paths);
    const legacyProcessName = getProcessName(paths.hash);
    const config = upsertWatcherSlot({
      id: paths.id,
      name: path.basename(terminalPath) || paths.hash,
      path: terminalPath,
      enabled: true,
    });

    await deleteProcessWithPM2(legacyProcessName);
    await syncWatcherGroupProcess(
      config,
      true,
      isNewTerminal ? { MT5_WATCHER_FORCE_BOOTSTRAP: '1' } : undefined,
    );
    return { success: true, message: `Watcher enabled for ${path.basename(terminalPath)}` };
  } catch (error) {
    return { success: false, message: `Failed to start process: ${error}` };
  }
});

ipcMain.handle('stop-process', async (_event, terminalPath: string) => {
  try {
    const paths = deriveMT5Paths(terminalPath);
    const processName = getProcessName(paths.id);
    const legacyProcessName = getProcessName(paths.hash);
    const config = removeWatcherSlot(terminalPath);

    await stopProcessWithPM2(processName);
    await stopProcessWithPM2(legacyProcessName);
    await syncWatcherGroupProcess(config, true, undefined, false);
    return { success: true, message: `Watcher group updated for ${path.basename(terminalPath)}` };
  } catch (error) {
    return { success: false, message: `Failed to stop process: ${error}` };
  }
});

/**
 * Check if a PM2 process is running by parsing PM2 JSON output
 */
async function isPM2ProcessRunning(processName: string): Promise<boolean> {
  try {
    const normalizeName = (value: unknown): string =>
      String(value ?? '')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .trim()
        .toLowerCase();

    const wantedName = normalizeName(processName);
    let output = await getRunningProcesses();

    console.log('[isPM2ProcessRunning] Raw output:', output.substring(0, 300));

    // Remove warning lines before JSON (lines starting with >>>>)
    const lines = output.split('\n');
    const jsonStartIndex = lines.findIndex(line => line.trim().startsWith('['));

    console.log('[isPM2ProcessRunning] JSON start index:', jsonStartIndex);

    if (jsonStartIndex >= 0) {
      output = lines.slice(jsonStartIndex).join('\n');
      console.log('[isPM2ProcessRunning] Cleaned output:', output.substring(0, 200));
    }

    // Parse JSON output from pm2 jlist
    try {
      const processes = JSON.parse(output);
      console.log('[isPM2ProcessRunning] Parsed', processes.length, 'processes');

      // Find process by name using a tolerant match because PM2 output can vary a bit.
      const process = processes.find((p: any) => {
        const candidates = [
          p?.name,
          p?.pm2_env?.name,
          p?.pm2_env?.pm_id,
          p?.pm2_env?.pm_exec_path,
        ].map(normalizeName).filter(Boolean);

        return candidates.some((candidate) => (
          candidate === wantedName ||
          candidate.includes(wantedName) ||
          wantedName.includes(candidate)
        ));
      });

      if (!process) {
        const names = processes
          .map((p: any) => normalizeName(p?.name || p?.pm2_env?.name || ''))
          .filter(Boolean);
        console.log('[isPM2ProcessRunning] Process not found in JSON. Wanted:', wantedName, 'Available names:', names.join(', ') || '<none>');
        return false;
      }

      // Check if process is online or launching
      const status = process.pm2_env?.status || '';
      console.log('[isPM2ProcessRunning] Process status:', status);
      return status === 'online' || status === 'launching';

    } catch (parseError: any) {
      // If JSON parse fails, fallback to text parsing
      console.log('[isPM2ProcessRunning] JSON parse failed:', parseError.message);
      console.log('[isPM2ProcessRunning] Using text parsing fallback');

      for (const line of lines) {
        if (!line.trim()) continue;

        // Skip warning/header lines
        if (
          line.includes('>>>>') ||
          line.includes('In memory') ||
          line.includes('In-memory') ||
          line.includes('Local PM2') ||
          line.includes('pm2 update') ||
          line.includes('PM2 version') ||
          line.includes('┌────') ||
          line.includes('├────') ||
          line.includes('└────') ||
          line.includes('│ id │')
        ) {
          continue;
        }

        // Check if line contains the process name and online status
        if (line.includes(processName)) {
          const isRunning = line.includes('online') || line.includes('launching');
          console.log('[isPM2ProcessRunning] Text parsing result:', isRunning);
          return isRunning;
        }
      }

      console.log('[isPM2ProcessRunning] Process not found in text parsing');
      return false;
    }
  } catch (error) {
    console.error('[isPM2ProcessRunning] Error:', error);
    return false;
  }
}

ipcMain.handle('get-process-status', async (_event, terminalPath: string) => {
  try {
    const paths = deriveMT5Paths(terminalPath);
    const processName = getProcessName(paths.id);
    const legacyProcessName = getProcessName(paths.hash);
    const config = loadWatcherGroupConfig();
    const inGroup = watcherConfigHasTerminal(config, terminalPath);
    const running = (inGroup && await getWatcherGroupStatus()) || await isPM2ProcessRunning(legacyProcessName) || await isPM2ProcessRunning(processName);
    return { running, message: running ? 'Process is running' : 'Process is stopped' };
  } catch (error) {
    return { running: false, message: `Failed to check status: ${error}` };
  }
});

ipcMain.handle('get-process-lifecycle-status', async (_event, terminalPath: string) => {
  try {
    const paths = deriveMT5Paths(terminalPath);
    const processName = getProcessName(paths.id);
    const legacyProcessName = getProcessName(paths.hash);
    const config = loadWatcherGroupConfig();
    const inGroup = watcherConfigHasTerminal(config, terminalPath);

    if (inGroup && await isPM2ProcessRunning(WATCHER_GROUP_PROCESS_NAME)) {
      return { status: 'running', message: 'Process is running' };
    }

    const legacyStatus = await getPM2ProcessLifecycleStatus(legacyProcessName);
    if (legacyStatus !== 'missing') {
      return { status: legacyStatus, message: legacyStatus === 'running' ? 'Process is running' : 'Process is stopped' };
    }

    const currentStatus = await getPM2ProcessLifecycleStatus(processName);
    return {
      status: currentStatus,
      message: currentStatus === 'running' ? 'Process is running' : currentStatus === 'stopped' ? 'Process is stopped' : 'Process is removed',
    };
  } catch (error) {
    return { status: 'missing', message: `Failed to check status: ${error}` };
  }
});

ipcMain.handle('get-watcher-group-config', async () => {
  try {
    return loadWatcherGroupConfig();
  } catch (error) {
    console.warn('[get-watcher-group-config] failed:', error);
    return { slots: [], upload: { enabled: false, serverUrl: '' } };
  }
});

ipcMain.handle('scan-mt5-processes', async () => {
  try {
    return await scanMt5RunningProcesses();
  } catch (error) {
    console.warn('[scan-mt5-processes] failed:', error);
    return [];
  }
});

ipcMain.handle('run-mt5-config', async (_event, slots: Mt5SlotConfig[]) => {
  try {
    const processes = await scanMt5RunningProcesses();
    const results: Array<{
      id?: string;
      name: string;
      path: string;
      running: boolean;
      started: boolean;
      success: boolean;
      message: string;
      pid?: number;
    }> = [];

    for (const slot of Array.isArray(slots) ? slots : []) {
      const rawPath = String(slot?.path || '').trim();
      const name = String(slot?.name || 'MT5').trim() || 'MT5';

      if (!rawPath) {
        results.push({
          id: slot?.id,
          name,
          path: '',
          running: false,
          started: false,
          success: false,
          message: 'Empty path',
        });
        continue;
      }

      const normalizedPath = normalizeWindowsPathLoose(rawPath);
      const folderPath = path.dirname(rawPath);
      const runningProcess = processes.find((proc) => {
        const executablePath = normalizeWindowsPathLoose(proc.executablePath || '');
        const commandLine = normalizeWindowsPathLoose(proc.commandLine || '');
        return (
          executablePath === normalizedPath ||
          executablePath.startsWith(normalizedPath) ||
          commandLine.includes(normalizedPath) ||
          processMatchesTerminal(proc, folderPath)
        );
      });

      if (runningProcess) {
        results.push({
          id: slot?.id,
          name,
          path: rawPath,
          running: true,
          started: false,
          success: true,
          message: `Already running (PID ${runningProcess.pid})`,
          pid: runningProcess.pid,
        });
        continue;
      }

      const startResult = await startMt5Terminal(rawPath);
      results.push({
        id: slot?.id,
        name,
        path: rawPath,
        running: false,
        started: startResult.success,
        success: startResult.success,
        message: startResult.message,
      });
    }

    return { success: true, results };
  } catch (error) {
    return { success: false, message: `Failed to run MT5 config: ${error}`, results: [] };
  }
});

ipcMain.handle('start-mt5-auto-restart', async (_event, slots: Mt5SlotConfig[], intervalSeconds?: number, password?: string) => {
  try {
    const configPath = writeMt5RunWatcherConfig(slots, intervalSeconds, password || '');
    const watcherScript = getMt5RunWatcherScriptPath();
    if (!fs.existsSync(watcherScript)) {
      return { success: false, message: `Watcher script not found at: ${watcherScript}` };
    }

    const alreadyRunning = await isPM2ProcessRunning(MT5_RUN_WATCHER_PROCESS_NAME);
    if (!alreadyRunning) {
      await startProcessWithPM2({
        name: MT5_RUN_WATCHER_PROCESS_NAME,
        script: watcherScript,
        args: [configPath, String(Math.max(10, intervalSeconds || 10))],
        cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../'),
      });
    }

    return {
      success: true,
      running: true,
      message: alreadyRunning
        ? 'MT5 auto restart config updated'
        : 'MT5 auto restart started',
      configPath,
    };
  } catch (error) {
    return { success: false, running: false, message: `Failed to start MT5 auto restart: ${error}` };
  }
});

ipcMain.handle('stop-mt5-auto-restart', async () => {
  try {
    await stopProcessWithPM2(MT5_RUN_WATCHER_PROCESS_NAME);
    await deleteProcessWithPM2(MT5_RUN_WATCHER_PROCESS_NAME);
    return { success: true, running: false, message: 'MT5 auto restart stopped' };
  } catch (error) {
    return { success: false, running: false, message: `Failed to stop MT5 auto restart: ${error}` };
  }
});

ipcMain.handle('get-mt5-auto-restart-status', async () => {
  try {
    const running = await isPM2ProcessRunning(MT5_RUN_WATCHER_PROCESS_NAME);
    return { running, message: running ? 'MT5 auto restart is running' : 'MT5 auto restart is stopped' };
  } catch (error) {
    return { running: false, message: `Failed to check MT5 auto restart: ${error}` };
  }
});

ipcMain.handle('check-pm2-available', async () => {
  try {
    return await checkPM2Available();
  } catch {
    return false;
  }
});

ipcMain.handle('select-source-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { title: 'Select Source Folder for Backup', properties: ['openDirectory'] });
  return !result.canceled && result.filePaths.length > 0 ? result.filePaths[0] : null;
});

ipcMain.handle('select-destination-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, { title: 'Select Destination Folder for Backup', properties: ['openDirectory'] });
  return !result.canceled && result.filePaths.length > 0 ? result.filePaths[0] : null;
});

const WATCHER_GROUP_PROCESS_NAME = 'mt5-log-watcher-group';
const BACKUP_GROUP_PROCESS_NAME = 'mt5-backup-group';
const MT5_HISTORY_SYNC_PROCESS_NAME = 'mt5-history-sync';

function getMt5HistorySyncConfigPath(): string {
  return path.join(app.getPath('userData'), 'mt5-history-config.json');
}

function getMt5HistorySyncScriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend', 'mt5HistorySync.py')
    : path.join(__dirname, '../../backend/mt5HistorySync.py');
}

function getDefaultMt5HistoryConfig(): Mt5HistorySyncConfig {
  return { interval_seconds: 30, state_dir: path.join(app.getPath('userData'), 'mt5-history-state'), accounts: [] };
}

function historyServerUrl(account: Partial<Mt5HistoryAccountConfig>): string {
  const configured = String(account.server_url || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  return String(account.history_url || '')
    .trim()
    .replace(/\/api\/v1\/history\/?$/i, '')
    .replace(/\/+$/, '');
}

function loadMt5HistoryConfig(): Mt5HistorySyncConfig {
  const configPath = getMt5HistorySyncConfigPath();
  if (!fs.existsSync(configPath)) return getDefaultMt5HistoryConfig();
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<Mt5HistorySyncConfig>;
    return {
      interval_seconds: Math.max(5, Number(parsed.interval_seconds) || 30),
      state_dir: String(parsed.state_dir || getDefaultMt5HistoryConfig().state_dir),
      accounts: Array.isArray(parsed.accounts)
        ? (parsed.accounts as Mt5HistoryAccountConfig[]).map((account) => ({
          ...account,
          server_url: historyServerUrl(account),
        }))
        : [],
    };
  } catch {
    return getDefaultMt5HistoryConfig();
  }
}

function saveMt5HistoryConfig(config: Mt5HistorySyncConfig): void {
  const normalized: Mt5HistorySyncConfig = {
    interval_seconds: Math.max(5, Number(config.interval_seconds) || 30),
    state_dir: String(config.state_dir || path.join(app.getPath('userData'), 'mt5-history-state')),
    accounts: config.accounts.map((account) => {
      const serverUrl = historyServerUrl(account);
      return {
        ...account,
        login: account.login === undefined || account.login === '' ? undefined : Number(account.login),
        terminal_path: String(account.terminal_path || '').trim(),
        server: String(account.server || '').trim(),
        server_url: serverUrl,
        interval_seconds: account.interval_seconds === undefined || account.interval_seconds === ''
          ? undefined
          : Math.max(5, Number(account.interval_seconds) || 30),
        history_url: serverUrl ? `${serverUrl}/api/v1/history` : String(account.history_url || '').trim(),
        closed_positions_url: serverUrl ? `${serverUrl}/api/v1/closed-positions` : String(account.closed_positions_url || '').trim(),
      };
    }),
  };
  const configPath = getMt5HistorySyncConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), 'utf-8');
}

ipcMain.handle('get-mt5-history-config', async () => ({ success: true, data: loadMt5HistoryConfig() }));

ipcMain.handle('save-mt5-history-config', async (_event, config: Mt5HistorySyncConfig) => {
  try {
    saveMt5HistoryConfig(config);
    return { success: true, message: 'MT5 history configuration saved.', data: loadMt5HistoryConfig() };
  } catch (error: any) {
    return { success: false, message: error?.message || String(error) };
  }
});

ipcMain.handle('start-mt5-history-sync', async () => {
  try {
    const config = loadMt5HistoryConfig();
    if (config.accounts.length === 0) return { success: false, running: false, message: 'Add at least one MT5 account first.' };
    const scriptPath = getMt5HistorySyncScriptPath();
    if (!fs.existsSync(scriptPath)) return { success: false, running: false, message: `History script not found: ${scriptPath}` };
    if (!(await checkPM2Available())) return { success: false, running: false, message: 'PM2 is not available.' };
    const pythonExe = getPythonExecutable();
    const configPath = getMt5HistorySyncConfigPath();
    saveMt5HistoryConfig(config);
    await startProcessWithPM2({
      name: MT5_HISTORY_SYNC_PROCESS_NAME,
      script: pythonExe,
      args: [scriptPath, '--config', configPath],
      cwd: path.dirname(scriptPath),
      env: { PYTHONUNBUFFERED: '1' },
    });
    return { success: true, running: true, message: 'MT5 history sync started with PM2.' };
  } catch (error: any) {
    return { success: false, running: false, message: error?.message || String(error) };
  }
});

ipcMain.handle('stop-mt5-history-sync', async () => {
  await stopProcessWithPM2(MT5_HISTORY_SYNC_PROCESS_NAME);
  return { success: true, running: false, message: 'MT5 history sync stopped.' };
});

ipcMain.handle('reset-mt5-history-state', async () => {
  try {
    await stopProcessWithPM2(MT5_HISTORY_SYNC_PROCESS_NAME);
    const config = loadMt5HistoryConfig();
    const configuredStateDir = String(config.state_dir || '').trim();
    if (!configuredStateDir) {
      return { success: false, message: 'History state directory is not configured.', deleted: 0 };
    }

    const stateDir = path.isAbsolute(configuredStateDir)
      ? configuredStateDir
      : path.resolve(path.dirname(getMt5HistorySyncScriptPath()), configuredStateDir);
    let deleted = 0;
    if (fs.existsSync(stateDir)) {
      for (const entry of fs.readdirSync(stateDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
        fs.unlinkSync(path.join(stateDir, entry.name));
        deleted += 1;
      }
    }
    return {
      success: true,
      deleted,
      message: `History cursor reset. Deleted ${deleted} state file(s).`,
    };
  } catch (error: any) {
    return { success: false, message: error?.message || String(error), deleted: 0 };
  }
});

ipcMain.handle('get-mt5-history-sync-status', async () => ({
  success: true,
  running: await isPM2ProcessRunning(MT5_HISTORY_SYNC_PROCESS_NAME),
}));

interface WatcherGroupSlot {
  id?: string;
  name: string;
  path: string;
  enabled?: boolean;
}

interface WatcherUploadConfig {
  enabled: boolean;
  serverUrl: string;
}

type PM2ProcessLifecycleStatus = 'running' | 'stopped' | 'missing';

async function getPM2ProcessLifecycleStatus(processName: string): Promise<PM2ProcessLifecycleStatus> {
  try {
    let output = await getRunningProcesses();
    const lines = output.split('\n');
    const jsonStartIndex = lines.findIndex(line => line.trim().startsWith('['));

    if (jsonStartIndex >= 0) {
      output = lines.slice(jsonStartIndex).join('\n');
    }

    try {
      const processes = JSON.parse(output);
      const process = processes.find((p: any) => p.name === processName);
      if (!process) return 'missing';
      const status = String(process.pm2_env?.status || '').toLowerCase();
      return status === 'online' || status === 'launching' ? 'running' : 'stopped';
    } catch {
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.includes(processName)) {
          const isRunning = line.includes('online') || line.includes('launching');
          return isRunning ? 'running' : 'stopped';
        }
      }
      return 'missing';
    }
  } catch {
    return 'missing';
  }
}

interface WatcherGroupConfig {
  slots: WatcherGroupSlot[];
  upload?: WatcherUploadConfig;
}

interface BackupGroupTask {
  id?: string;
  sourcePath: string;
  destPath: string;
  intervalSeconds: number;
  enabled?: boolean;
}

interface BackupGroupConfig {
  tasks: BackupGroupTask[];
}

function ensureGroupConfigDir(): string {
  const dir = path.join(app.getPath('userData'), 'group-config');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getWatcherGroupConfigPath(): string {
  return path.join(ensureGroupConfigDir(), 'watcher-group.json');
}

function getBackupGroupConfigPath(): string {
  return path.join(ensureGroupConfigDir(), 'backup-group.json');
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureGroupConfigDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function loadWatcherGroupConfig(): WatcherGroupConfig {
  const raw = readJsonFile<any>(getWatcherGroupConfigPath(), { slots: [] });
  const slotsSource = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.slots)
      ? raw.slots
      : Array.isArray(raw?.terminals)
        ? raw.terminals
        : [];
  const uploadSource = Array.isArray(raw) ? null : raw?.upload || raw?.serverSync || null;

  return {
    slots: slotsSource
      .map((slot: any) => ({
        id: String(slot?.id || '').trim() || undefined,
        name: String(slot?.name || '').trim() || path.basename(String(slot?.path || '').trim()) || 'MT5',
        path: String(slot?.path || '').trim(),
        enabled: slot?.enabled !== false,
      }))
      .filter((slot: WatcherGroupSlot) => !!slot.path),
    upload: uploadSource
      ? {
          enabled: uploadSource.enabled !== false,
          serverUrl: String(uploadSource.serverUrl || uploadSource.url || '').trim(),
        }
      : { enabled: false, serverUrl: '' },
  };
}

function saveWatcherGroupConfig(config: WatcherGroupConfig): void {
  writeJsonFile(getWatcherGroupConfigPath(), {
    slots: config.slots,
    upload: config.upload || { enabled: false, serverUrl: '' },
  });
}

function getWatcherSlotKey(terminalPath: string): string {
  return createStablePathId(terminalPath);
}

function upsertWatcherSlot(slot: WatcherGroupSlot): WatcherGroupConfig {
  const config = loadWatcherGroupConfig();
  const normalizedPath = path.normalize(slot.path);
  const key = getWatcherSlotKey(normalizedPath);
  const nextSlots = config.slots.filter((existing) => getWatcherSlotKey(existing.path) !== key);
  nextSlots.push({
    id: slot.id || key,
    name: slot.name || path.basename(normalizedPath) || 'MT5',
    path: normalizedPath,
    enabled: slot.enabled !== false,
  });
  const nextConfig = { slots: nextSlots, upload: config.upload };
  saveWatcherGroupConfig(nextConfig);
  return nextConfig;
}

function removeWatcherSlot(terminalPath: string): WatcherGroupConfig {
  const config = loadWatcherGroupConfig();
  const key = getWatcherSlotKey(terminalPath);
  const nextSlots = config.slots.map((existing) => (
    getWatcherSlotKey(existing.path) === key ? { ...existing, enabled: false } : existing
  ));
  const nextConfig = { slots: nextSlots, upload: config.upload };
  saveWatcherGroupConfig(nextConfig);
  return nextConfig;
}

function disableAllWatcherSlots(): WatcherGroupConfig {
  const config = loadWatcherGroupConfig();
  const nextSlots = config.slots.map((slot) => ({ ...slot, enabled: false }));
  const nextConfig = { slots: nextSlots, upload: config.upload };
  saveWatcherGroupConfig(nextConfig);
  return nextConfig;
}

function watcherConfigHasTerminal(config: WatcherGroupConfig, terminalPath: string): boolean {
  const key = getWatcherSlotKey(terminalPath);
  return config.slots.some((slot) => slot.enabled !== false && getWatcherSlotKey(slot.path) === key);
}

function getWatcherUploadConfig(): WatcherUploadConfig {
  return loadWatcherGroupConfig().upload || { enabled: false, serverUrl: '' };
}

function setWatcherUploadConfig(upload: Partial<WatcherUploadConfig>): WatcherGroupConfig {
  const config = loadWatcherGroupConfig();
  const nextConfig: WatcherGroupConfig = {
    slots: config.slots,
    upload: {
      enabled: upload.enabled ?? config.upload?.enabled ?? false,
      serverUrl: String(upload.serverUrl ?? config.upload?.serverUrl ?? '').trim(),
    },
  };
  saveWatcherGroupConfig(nextConfig);
  return nextConfig;
}

function loadBackupGroupConfig(): BackupGroupConfig {
  const raw = readJsonFile<any>(getBackupGroupConfigPath(), { tasks: [] });
  const tasksSource = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.tasks)
      ? raw.tasks
      : Array.isArray(raw?.backups)
        ? raw.backups
        : [];

  return {
    tasks: tasksSource
      .map((task: any) => ({
        id: String(task?.id || '').trim() || undefined,
        sourcePath: String(task?.sourcePath || '').trim(),
        destPath: String(task?.destPath || '').trim(),
        intervalSeconds: Math.max(1, parseInt(String(task?.intervalSeconds || '0'), 10) || 0),
        enabled: task?.enabled !== false,
      }))
      .filter((task: BackupGroupTask) => !!task.sourcePath && !!task.destPath && task.intervalSeconds > 0),
  };
}

function saveBackupGroupConfig(tasks: BackupGroupTask[]): void {
  writeJsonFile(getBackupGroupConfigPath(), { tasks });
}

function getBackupTaskKey(sourcePath: string, destPath: string, intervalSeconds: number): string {
  return createStableIdFromParts(sourcePath, destPath, String(intervalSeconds));
}

function upsertBackupTask(task: BackupGroupTask): BackupGroupConfig {
  const config = loadBackupGroupConfig();
  const key = getBackupTaskKey(task.sourcePath, task.destPath, task.intervalSeconds);
  const nextTasks = config.tasks.filter((existing) => getBackupTaskKey(existing.sourcePath, existing.destPath, existing.intervalSeconds) !== key);
  nextTasks.push({
    id: task.id || key,
    sourcePath: path.normalize(task.sourcePath),
    destPath: path.normalize(task.destPath),
    intervalSeconds: Math.max(1, task.intervalSeconds || 1),
    enabled: task.enabled !== false,
  });
  saveBackupGroupConfig(nextTasks);
  return { tasks: nextTasks };
}

function removeBackupTask(task: BackupGroupTask): BackupGroupConfig {
  const config = loadBackupGroupConfig();
  const key = getBackupTaskKey(task.sourcePath, task.destPath, task.intervalSeconds);
  const nextTasks = config.tasks.map((existing) => (
    getBackupTaskKey(existing.sourcePath, existing.destPath, existing.intervalSeconds) === key ? { ...existing, enabled: false } : existing
  ));
  saveBackupGroupConfig(nextTasks);
  return { tasks: nextTasks };
}

function disableAllBackupTasks(): BackupGroupConfig {
  const config = loadBackupGroupConfig();
  const nextTasks = config.tasks.map((task) => ({ ...task, enabled: false }));
  saveBackupGroupConfig(nextTasks);
  return { tasks: nextTasks };
}

function backupConfigHasTask(config: BackupGroupConfig, task: BackupGroupTask): boolean {
  const key = getBackupTaskKey(task.sourcePath, task.destPath, task.intervalSeconds);
  return config.tasks.some((existing) => existing.enabled !== false && getBackupTaskKey(existing.sourcePath, existing.destPath, existing.intervalSeconds) === key);
}

async function syncWatcherGroupProcess(
  config: WatcherGroupConfig,
  forceRestart = false,
  startEnv?: NodeJS.ProcessEnv,
  autoEnableRunningTerms = true,
): Promise<void> {
  const watcherScript = getBackendScriptPath('watcher.js');
  if (!fs.existsSync(watcherScript)) {
    throw new Error(`Backend watcher script not found at: ${watcherScript}.`);
  }

  const syncedConfig = autoEnableRunningTerms
    ? await autoEnableRunningWatcherTerminals(config)
    : config;
  const hasEnabledSlots = syncedConfig.slots.some((slot) => slot.enabled !== false);
  if (!hasEnabledSlots) {
    await stopProcessWithPM2(WATCHER_GROUP_PROCESS_NAME);
    await deleteProcessWithPM2(WATCHER_GROUP_PROCESS_NAME);
    return;
  }

  if (!forceRestart && await isPM2ProcessRunning(WATCHER_GROUP_PROCESS_NAME)) {
    return;
  }

  if (forceRestart) {
    console.log('[watcher-upload] restarting watcher group process');
    await stopProcessWithPM2(WATCHER_GROUP_PROCESS_NAME);
    await deleteProcessWithPM2(WATCHER_GROUP_PROCESS_NAME);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  await startProcessWithPM2({
    name: WATCHER_GROUP_PROCESS_NAME,
    script: watcherScript,
    args: [getWatcherGroupConfigPath()],
    cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../'),
    env: startEnv,
  });
}

async function syncBackupGroupProcess(config: BackupGroupConfig): Promise<void> {
  const backupScript = getBackendScriptPath('folderBackup.js');
  if (!fs.existsSync(backupScript)) {
    throw new Error(`Backup script not found at: ${backupScript}.`);
  }

  const hasEnabledTasks = config.tasks.some((task) => task.enabled !== false);
  if (!hasEnabledTasks) {
    await stopProcessWithPM2(BACKUP_GROUP_PROCESS_NAME);
    await deleteProcessWithPM2(BACKUP_GROUP_PROCESS_NAME);
    return;
  }

  if (await isPM2ProcessRunning(BACKUP_GROUP_PROCESS_NAME)) {
    return;
  }

  await startProcessWithPM2({
    name: BACKUP_GROUP_PROCESS_NAME,
    script: backupScript,
    args: [getBackupGroupConfigPath()],
    cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../'),
  });
}

async function getWatcherGroupStatus(): Promise<boolean> {
  return isPM2ProcessRunning(WATCHER_GROUP_PROCESS_NAME);
}

async function getBackupGroupStatus(): Promise<boolean> {
  return isPM2ProcessRunning(BACKUP_GROUP_PROCESS_NAME);
}

ipcMain.handle('get-watcher-upload-config', async () => {
  try {
    const data = getWatcherUploadConfig();
    console.log('[watcher-upload] get config', data);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: `Failed to load watcher upload config: ${error}`, data: { enabled: false, serverUrl: '' } };
  }
});

ipcMain.handle('set-watcher-upload-config', async (_event, upload: { enabled?: boolean; serverUrl?: string }) => {
  try {
    const enabled = upload?.enabled ?? false;
    const serverUrl = String(upload?.serverUrl || '').trim();
    console.log('[watcher-upload] set config requested', { enabled, serverUrl });

    if (enabled) {
      if (!serverUrl) {
        console.warn('[watcher-upload] save rejected: missing server url');
        return { success: false, message: 'Server URL is required when upload is enabled' };
      }
      try {
        new URL(serverUrl);
      } catch {
        console.warn('[watcher-upload] save rejected: invalid server url');
        return { success: false, message: 'Invalid server URL' };
      }
    }

    const config = setWatcherUploadConfig({ enabled, serverUrl });
    await syncWatcherGroupProcess(config, true);
    console.log('[watcher-upload] config saved', config.upload);
    return { success: true, message: enabled ? 'Watcher upload enabled' : 'Watcher upload disabled', data: config.upload };
  } catch (error) {
    console.error('[watcher-upload] save failed', error);
    return { success: false, message: `Failed to save watcher upload config: ${error}` };
  }
});

ipcMain.handle('resync-watcher-upload-state', async () => {
  try {
    const config = loadWatcherGroupConfig();
    await syncWatcherGroupProcess(config, true, { MT5_WATCHER_FORCE_BOOTSTRAP: '1' });

    return {
      success: true,
      message: 'Resynced watcher upload state and reloaded current logs',
      data: { cleared: 0 },
    };
  } catch (error) {
    console.error('[watcher-upload] resync failed', error);
    return { success: false, message: `Failed to resync watcher upload state: ${error}` };
  }
});

function getBackupProcessName(sourcePath: string, destPath: string, intervalSeconds: number): string {
  const backupKey = createStableIdFromParts(sourcePath, destPath, String(intervalSeconds));
  return `mt5-backup-${backupKey}`;
}

function getLegacyBackupProcessName(sourcePath: string): string {
  const hash = path.basename(sourcePath) || sourcePath.replace(/[^\w]/g, '');
  return `mt5-backup-${hash}`;
}

ipcMain.handle('start-backup', async (_event, sourcePath: string, destPath: string, intervalSeconds: number) => {
  try {
    if (!fs.existsSync(sourcePath)) return { success: false, message: 'Source folder does not exist' };
    const legacyProcessName = getLegacyBackupProcessName(sourcePath);
    const config = upsertBackupTask({
      id: createStableIdFromParts(sourcePath, destPath, String(intervalSeconds)),
      sourcePath,
      destPath,
      intervalSeconds,
      enabled: true,
    });

    await deleteProcessWithPM2(legacyProcessName);
    await syncBackupGroupProcess(config);
    return { success: true, message: `Backup enabled for ${path.basename(sourcePath)}` };
  } catch (error) {
    return { success: false, message: `Failed to start backup: ${error}` };
  }
});

ipcMain.handle('stop-backup', async (_event, sourcePath: string, destPath: string, intervalSeconds: number) => {
  try {
    const legacyProcessName = getLegacyBackupProcessName(sourcePath);
    const config = removeBackupTask({ sourcePath, destPath, intervalSeconds });

    await stopProcessWithPM2(legacyProcessName);
    await syncBackupGroupProcess(config);
    return { success: true, message: `Backup disabled for ${path.basename(sourcePath)}` };
  } catch (error) {
    return { success: false, message: `Failed to stop backup: ${error}` };
  }
});

ipcMain.handle('get-backup-status', async (_event, sourcePath: string, destPath: string, intervalSeconds: number) => {
  try {
    const legacyProcessName = getLegacyBackupProcessName(sourcePath);
    const config = loadBackupGroupConfig();
    const inGroup = backupConfigHasTask(config, { sourcePath, destPath, intervalSeconds });
    const running = (inGroup && await getBackupGroupStatus()) || await isPM2ProcessRunning(legacyProcessName);
    return { running, message: running ? 'Backup is running' : 'Backup is stopped' };
  } catch (error) {
    return { running: false, message: `Failed to check status: ${error}` };
  }
});

ipcMain.handle('get-backup-lifecycle-status', async (_event, sourcePath: string, destPath: string, intervalSeconds: number) => {
  try {
    const legacyProcessName = getLegacyBackupProcessName(sourcePath);
    const config = loadBackupGroupConfig();
    const inGroup = backupConfigHasTask(config, { sourcePath, destPath, intervalSeconds });
    const groupStatus = await getPM2ProcessLifecycleStatus(BACKUP_GROUP_PROCESS_NAME);

    if (inGroup && groupStatus === 'running') {
      return { status: 'running', message: 'Backup is running' };
    }

    const legacyStatus = await getPM2ProcessLifecycleStatus(legacyProcessName);
    if (legacyStatus !== 'missing') {
      return { status: legacyStatus, message: legacyStatus === 'running' ? 'Backup is running' : 'Backup is stopped' };
    }

    if (groupStatus !== 'missing') {
      return {
        status: 'stopped',
        message: groupStatus === 'running' ? 'Backup is running' : 'Backup is stopped',
      };
    }

    return {
      status: 'missing',
      message: 'Backup is removed',
    };
  } catch (error) {
    return { status: 'missing', message: `Failed to check status: ${error}` };
  }
});

// ──────────────────────────────
// System Monitor
// ──────────────────────────────
function getSystemMonitorProcessName(): string {
  return 'mt5-system-monitor';
}

ipcMain.handle('start-system-monitor', async (_event, serverUrl: string, intervalSeconds: number, restStart?: number, restEnd?: number) => {
  try {
    console.log('[SystemMonitor] IPC received:', { serverUrl, intervalSeconds, restStart, restEnd });

    if (!serverUrl) return { success: false, message: 'Server URL is required' };

    // Validate URL
    try {
      new URL(serverUrl);
    } catch {
      return { success: false, message: 'Invalid server URL' };
    }

    if (intervalSeconds < 1 || intervalSeconds > 3600) {
      return { success: false, message: 'Interval must be between 1 and 3600 seconds' };
    }

    // Default rest period: 55-5
    const restStartMin = restStart !== undefined ? Math.max(0, Math.min(59, restStart)) : 55;
    const restEndMin = restEnd !== undefined ? Math.max(0, Math.min(59, restEnd)) : 5;

    console.log('[SystemMonitor] Using rest period:', { restStartMin, restEndMin });

    const apiKey = process.env.SYSTEM_MONITOR_API_KEY?.trim();
    if (!apiKey) {
      return {
        success: false,
        message:
          'SYSTEM_MONITOR_API_KEY is not set. Add it to .env in the project root (same value as on the server).',
      };
    }

    const processName = getSystemMonitorProcessName();
    const monitorScript = getBackendScriptPath('systemMonitor.js');

    if (!fs.existsSync(monitorScript)) {
      return { success: false, message: `System monitor script not found at: ${monitorScript}` };
    }

    const pm2Args = [serverUrl, intervalSeconds.toString(), restStartMin.toString(), restEndMin.toString()];
    console.log('[SystemMonitor] PM2 args:', pm2Args);

    await startProcessWithPM2({
      name: processName,
      script: monitorScript,
      args: pm2Args,
      cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../'),
    });

    return { success: true, message: `System monitor started (rest period: ${restStartMin}-${restEndMin})` };
  } catch (error) {
    return { success: false, message: `Failed to start system monitor: ${error}` };
  }
});

ipcMain.handle('stop-system-monitor', async (_event, serverUrl?: string) => {
  try {
    const apiKey = process.env.SYSTEM_MONITOR_API_KEY?.trim();
    let disconnectNote = '';

    if (!serverUrl?.trim()) {
      disconnectNote = ' (no server URL – disconnect skipped)';
    } else if (!apiKey) {
      disconnectNote = ' (SYSTEM_MONITOR_API_KEY missing – disconnect skipped)';
    } else {
      try {
        // Normalize IPv6 ::1 to IPv4 127.0.0.1 to avoid ECONNREFUSED
        let normalizedUrl = serverUrl;
        try {
          const u = new URL(serverUrl);
          if (u.hostname === '::1') {
            u.hostname = '127.0.0.1';
            normalizedUrl = u.toString();
            console.log(`[SystemMonitor] Converted IPv6 ::1 to IPv4 127.0.0.1: ${normalizedUrl}`);
          }
        } catch { /* invalid URL, use as-is */ }

        console.log(`[SystemMonitor] Original ingest URL: ${normalizedUrl}`);
        const disconnect = await sendMonitorDisconnect(normalizedUrl, apiKey);
        if (disconnect.ok) {
          console.log(`[SystemMonitor] ✓ Disconnect success`);
          console.log(`[SystemMonitor] → Disconnect URL: ${disconnect.url}`);
          console.log(`[SystemMonitor] → Machine ID: ${disconnect.machineId}`);
        } else {
          console.log(`[SystemMonitor] ✗ Disconnect failed: ${disconnect.message}`);
        }
        disconnectNote = disconnect.ok ? ` ${disconnect.message}` : ` Disconnect failed: ${disconnect.message}`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[SystemMonitor] disconnect request failed:', msg);
        disconnectNote = ` Disconnect error: ${msg}`;
      }
    }

    await stopProcessWithPM2(getSystemMonitorProcessName());
    return { success: true, message: `System monitor stopped.${disconnectNote}` };
  } catch (error) {
    return { success: false, message: `Failed to stop system monitor: ${error}` };
  }
});

ipcMain.handle('get-system-monitor-status', async () => {
  try {
    const processName = getSystemMonitorProcessName();
    const running = await isPM2ProcessRunning(processName);
    return { running, message: running ? 'System monitor is running' : 'System monitor is stopped' };
  } catch (error) {
    return { running: false, message: `Failed to check status: ${error}` };
  }
});

// ──────────────────────────────
// EA Scanner
// ──────────────────────────────
function getEaScannerProcessName(): string {
  return 'mt5-ea-scanner-sync';
}

function getEaScannerPathsConfigPath(): string {
  return path.join(app.getPath('userData'), 'ea-scanner-paths.json');
}

function loadEaScannerPaths(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(getEaScannerPathsConfigPath(), 'utf-8'));
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function saveEaScannerPaths(paths: string[]): string[] {
  const unique = [...new Map(paths.map((item) => [path.normalize(item.trim()).toLowerCase(), path.normalize(item.trim())])).values()];
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(getEaScannerPathsConfigPath(), JSON.stringify(unique, null, 2), 'utf-8');
  return unique;
}

function isEaScannerTerminalPath(folderPath: string): boolean {
  try {
    const names = new Set(fs.readdirSync(folderPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name.toLowerCase()));
    return names.has('config') && names.has('mql5');
  } catch {
    return false;
  }
}

function countEaScannerTerminals(paths: string[]): number {
  let count = 0;
  for (const selectedPath of paths) {
    if (isEaScannerTerminalPath(selectedPath)) {
      count += 1;
      continue;
    }
    try {
      count += fs.readdirSync(selectedPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && isEaScannerTerminalPath(path.join(selectedPath, entry.name)))
        .length;
    } catch {
      // Ignore missing or inaccessible saved folders.
    }
  }
  return count;
}

function getEaScannerPathState() {
  const paths = loadEaScannerPaths();
  return { paths, terminalCount: countEaScannerTerminals(paths) };
}

function addEaScannerPaths(paths: string[]): string[] {
  const currentPaths = loadEaScannerPaths();
  return saveEaScannerPaths([...currentPaths, ...paths]);
}

ipcMain.handle('add-ea-scanner-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select an MT5 terminal or cluster folder',
    defaultPath: process.env.APPDATA || undefined,
    properties: ['openDirectory', 'multiSelections'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, path: null, ...getEaScannerPathState() };
  }
  const selectedPaths = result.filePaths;
  return {
    success: true,
    path: selectedPaths[0],
    ...(() => {
      const paths = addEaScannerPaths(selectedPaths);
      return { paths, terminalCount: countEaScannerTerminals(paths) };
    })(),
  };
});

function scannerPathArgs(paths: string[]): string[] {
  return paths.flatMap((scannerPath) => ['--path', scannerPath]);
}

function runEaScannerNode(args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const script = getBackendScriptPath('eaScanner.js');
    if (!fs.existsSync(script)) {
      reject(new Error(`EA scanner script not found at: ${script}. Run npm run build:backend first.`));
      return;
    }

    const proc = spawn('node', [script, ...args], {
      cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../'),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `EA scanner exited with code ${code}`));
        return;
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error('EA scanner returned empty output'));
        return;
      }
      try {
        resolve(JSON.parse(trimmed));
      } catch {
        reject(new Error(`Failed to parse EA scanner output: ${trimmed.slice(0, 200)}`));
      }
    });
  });
}

ipcMain.handle('select-ea-scanner-paths', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Select MT5 terminal folders (you can select multiple)',
    defaultPath: process.env.APPDATA || undefined,
    properties: ['openDirectory', 'multiSelections'],
  });
  if (result.canceled) return { success: false, ...getEaScannerPathState() };
  const paths = addEaScannerPaths(result.filePaths);
  return { success: true, paths, terminalCount: countEaScannerTerminals(paths) };
});

ipcMain.handle('get-ea-scanner-paths', async () => getEaScannerPathState());

ipcMain.handle('clear-ea-scanner-paths', async () => {
  saveEaScannerPaths([]);
  return { success: true, paths: [], terminalCount: 0 };
});

ipcMain.handle('remove-ea-scanner-path', async (_event, scannerPath: string) => {
  const targetKey = path.normalize(String(scannerPath || '').trim()).toLowerCase();
  const paths = loadEaScannerPaths().filter((savedPath) => (
    path.normalize(savedPath).toLowerCase() !== targetKey
  ));
  const savedPaths = saveEaScannerPaths(paths);
  return { success: true, paths: savedPaths, terminalCount: countEaScannerTerminals(savedPaths) };
});

ipcMain.handle('run-ea-scanner-scan', async () => {
  try {
    const paths = loadEaScannerPaths();
    if (paths.length === 0) {
      return { success: false, message: 'Select at least one MT5 terminal folder before scanning.', data: null };
    }
    const result = await runEaScannerNode(['scan', ...scannerPathArgs(paths)]);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, message: String(error), data: null };
  }
});

ipcMain.handle('sync-ea-scanner-bots', async (_event, serverUrl: string) => {
  try {
    const paths = loadEaScannerPaths();
    if (paths.length === 0) {
      return { success: false, message: 'Select at least one MT5 terminal folder before syncing.' };
    }
    if (!serverUrl?.trim()) {
      return { success: false, message: 'Server URL is required' };
    }
    try {
      new URL(serverUrl);
    } catch {
      return { success: false, message: 'Invalid server URL' };
    }

    const apiKey = process.env.SYSTEM_MONITOR_API_KEY?.trim();
    if (!apiKey) {
      return {
        success: false,
        message: 'SYSTEM_MONITOR_API_KEY is not set. Add it to .env in the project root.',
      };
    }

    const result = await runEaScannerNode(['sync', serverUrl, '', ...scannerPathArgs(paths)]) as {
      scan?: { bots?: unknown[]; summary?: Record<string, number> };
      post?: { message?: string; count?: number; url?: string };
    };

    return {
      success: true,
      message: result.post?.message || 'Sync completed',
      data: result,
    };
  } catch (error) {
    return { success: false, message: String(error) };
  }
});

ipcMain.handle('start-ea-scanner-sync', async (_event, serverUrl: string, intervalSeconds: number, restStart?: number, restEnd?: number) => {
  try {
    const paths = loadEaScannerPaths();
    if (paths.length === 0) {
      return { success: false, message: 'Select at least one MT5 terminal folder before starting auto-sync.' };
    }
    if (!serverUrl?.trim()) return { success: false, message: 'Server URL is required' };
    try {
      new URL(serverUrl);
    } catch {
      return { success: false, message: 'Invalid server URL' };
    }

    const interval = Math.max(30, intervalSeconds || 300);
    const restStartMin = restStart !== undefined ? Math.max(0, Math.min(59, restStart)) : 55;
    const restEndMin = restEnd !== undefined ? Math.max(0, Math.min(59, restEnd)) : 5;
    const apiKey = process.env.SYSTEM_MONITOR_API_KEY?.trim();
    if (!apiKey) {
      return {
        success: false,
        message: 'SYSTEM_MONITOR_API_KEY is not set. Add it to .env in the project root.',
      };
    }

    const script = getBackendScriptPath('eaScanner.js');
    if (!fs.existsSync(script)) {
      return { success: false, message: `EA scanner script not found at: ${script}` };
    }

    await startProcessWithPM2({
      name: getEaScannerProcessName(),
      script,
      args: ['daemon', serverUrl, interval.toString(), restStartMin.toString(), restEndMin.toString(), ...scannerPathArgs(paths)],
      cwd: app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../'),
    });

    return { success: true, message: `EA scanner sync started (every ${interval}s, rest period ${restStartMin}-${restEndMin})` };
  } catch (error) {
    return { success: false, message: `Failed to start EA scanner sync: ${error}` };
  }
});

ipcMain.handle('stop-ea-scanner-sync', async () => {
  try {
    await stopProcessWithPM2(getEaScannerProcessName());
    return { success: true, message: 'EA scanner sync stopped' };
  } catch (error) {
    return { success: false, message: `Failed to stop EA scanner sync: ${error}` };
  }
});

ipcMain.handle('get-ea-scanner-sync-status', async () => {
  try {
    const running = await isPM2ProcessRunning(getEaScannerProcessName());
    return { running, message: running ? 'EA scanner sync is running' : 'EA scanner sync is stopped' };
  } catch (error) {
    return { running: false, message: `Failed to check status: ${error}` };
  }
});

// ──────────────────────────────
// ──────────────────────────────
function normalizeWindowsPathLoose(value: string): string {
  return normalizeWindowsPathForMatch(value).replace(/\\+$/g, '');
}

function startMt5Terminal(exePath: string): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(exePath)) {
        resolve({ success: false, message: `Path not found: ${exePath}` });
        return;
      }

      const child = spawn(exePath, ['/portable'], {
        cwd: path.dirname(exePath),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });

      child.once('error', (error) => {
        resolve({ success: false, message: `Failed to start MT5: ${error}` });
      });

      child.once('spawn', () => {
        child.unref();
        resolve({ success: true, message: `Started ${path.basename(path.dirname(exePath))}` });
      });
    } catch (error) {
      resolve({ success: false, message: `Failed to start MT5: ${error}` });
    }
  });
}

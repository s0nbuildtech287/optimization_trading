/**
 * Preload script for secure IPC communication
 * Exposes safe methods to the renderer process
 *
 * IMPORTANT: After editing this file, you MUST rebuild:
 *   npm run build   (or: npx tsc)
 * Electron loads preload.JS, not preload.TS directly.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ── Pass object literal DIRECTLY into contextBridge ──
// Do NOT store in a typed variable first — TypeScript type-checking
// can silently drop methods that don't satisfy an interface constraint.
contextBridge.exposeInMainWorld('ipc', {

  // ── Log Watcher ──
  startProcess: (terminalPath: string) =>
    ipcRenderer.invoke('start-process', terminalPath),

  stopProcess: (terminalPath: string) =>
    ipcRenderer.invoke('stop-process', terminalPath),

  getProcessStatus: (terminalPath: string) =>
    ipcRenderer.invoke('get-process-status', terminalPath),
  getProcessLifecycleStatus: (terminalPath: string) =>
    ipcRenderer.invoke('get-process-lifecycle-status', terminalPath),
  getWatcherGroupConfig: () =>
    ipcRenderer.invoke('get-watcher-group-config'),
  scanMt5Processes: () =>
    ipcRenderer.invoke('scan-mt5-processes'),
  runMt5Config: (slots: Array<{ id?: string; name: string; path: string }>) =>
    ipcRenderer.invoke('run-mt5-config', slots),
  startMt5AutoRestart: (slots: Array<{ id?: string; name: string; path: string }>, intervalSeconds?: number, password?: string) =>
    ipcRenderer.invoke('start-mt5-auto-restart', slots, intervalSeconds, password),
  stopMt5AutoRestart: () =>
    ipcRenderer.invoke('stop-mt5-auto-restart'),
  getMt5AutoRestartStatus: () =>
    ipcRenderer.invoke('get-mt5-auto-restart-status'),

  getMt5WorkersSnapshot: () => ipcRenderer.invoke('mt5-workers:get-snapshot'),
  getMt5WorkerLogs: (workerId: string) => ipcRenderer.invoke('mt5-workers:get-logs', workerId),
  clearMt5WorkerLogs: (workerId: string) => ipcRenderer.invoke('mt5-workers:clear-logs', workerId),
  saveMt5WorkerConnection: (connection: unknown) => ipcRenderer.invoke('mt5-workers:save-connection', connection),
  testMt5WorkerServer: (serverUrl: string) => ipcRenderer.invoke('mt5-workers:test-server', serverUrl),
  verifyMt5WorkerIdentity: (serverUrl: string, apiKey: string) => ipcRenderer.invoke('mt5-workers:verify-identity', serverUrl, apiKey),
  createMt5Worker: (worker?: unknown) => ipcRenderer.invoke('mt5-workers:create', worker),
  updateMt5Worker: (workerId: string, updates: unknown) => ipcRenderer.invoke('mt5-workers:update', workerId, updates),
  deleteMt5Worker: (workerId: string) => ipcRenderer.invoke('mt5-workers:delete', workerId),
  startMt5Worker: (workerId: string) => ipcRenderer.invoke('mt5-workers:start', workerId),
  stopMt5Worker: (workerId: string) => ipcRenderer.invoke('mt5-workers:stop', workerId),
  restartMt5Worker: (workerId: string) => ipcRenderer.invoke('mt5-workers:restart', workerId),
  startAllMt5Workers: () => ipcRenderer.invoke('mt5-workers:start-all'),
  stopAllMt5Workers: () => ipcRenderer.invoke('mt5-workers:stop-all'),
  selectMt5WorkerTerminal: () => ipcRenderer.invoke('mt5-workers:select-terminal'),
  selectMt5WorkerDirectory: (title?: string, defaultPath?: string) => ipcRenderer.invoke('mt5-workers:select-directory', title, defaultPath),
  onMt5WorkersState: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: unknown, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on('mt5-workers:state', listener);
    return () => ipcRenderer.removeListener('mt5-workers:state', listener);
  },
  onMt5WorkerLog: (callback: (entry: { workerId: string; line: string }) => void) => {
    const listener = (_event: unknown, entry: { workerId: string; line: string }) => callback(entry);
    ipcRenderer.on('mt5-workers:log', listener);
    return () => ipcRenderer.removeListener('mt5-workers:log', listener);
  },

  getMt5HistoryConfig: () => ipcRenderer.invoke('get-mt5-history-config'),
  saveMt5HistoryConfig: (config: unknown) => ipcRenderer.invoke('save-mt5-history-config', config),
  startMt5HistorySync: () => ipcRenderer.invoke('start-mt5-history-sync'),
  stopMt5HistorySync: () => ipcRenderer.invoke('stop-mt5-history-sync'),
  resetMt5HistoryState: () => ipcRenderer.invoke('reset-mt5-history-state'),
  getMt5HistorySyncStatus: () => ipcRenderer.invoke('get-mt5-history-sync-status'),

  selectTerminalFolder: () =>
    ipcRenderer.invoke('select-terminal-folder'),

  checkPM2Available: () =>
    ipcRenderer.invoke('check-pm2-available'),

  // â”€â”€ Watcher upload to server â”€â”€ 
  getWatcherUploadConfig: () =>
    ipcRenderer.invoke('get-watcher-upload-config'),
  setWatcherUploadConfig: (upload: { enabled?: boolean; serverUrl?: string }) =>
    ipcRenderer.invoke('set-watcher-upload-config', upload),
  resyncWatcherUploadState: () =>
    ipcRenderer.invoke('resync-watcher-upload-state'),

  // ── Backup ──
  selectSourceFolder: () =>
    ipcRenderer.invoke('select-source-folder'),

  selectDestinationFolder: () =>
    ipcRenderer.invoke('select-destination-folder'),

  startBackup: (sourcePath: string, destPath: string, intervalSeconds: number) =>
    ipcRenderer.invoke('start-backup', sourcePath, destPath, intervalSeconds),

  stopBackup: (sourcePath: string, destPath: string, intervalSeconds: number) =>
    ipcRenderer.invoke('stop-backup', sourcePath, destPath, intervalSeconds),

  getBackupStatus: (sourcePath: string, destPath: string, intervalSeconds: number) =>
    ipcRenderer.invoke('get-backup-status', sourcePath, destPath, intervalSeconds),
  getBackupLifecycleStatus: (sourcePath: string, destPath: string, intervalSeconds: number) =>
    ipcRenderer.invoke('get-backup-lifecycle-status', sourcePath, destPath, intervalSeconds),

  // ── Optimization ──
  startSystemMonitor: (serverUrl: string, intervalSeconds: number, restStart?: number, restEnd?: number) =>
    ipcRenderer.invoke('start-system-monitor', serverUrl, intervalSeconds, restStart, restEnd),

  stopSystemMonitor: (serverUrl: string) =>
    ipcRenderer.invoke('stop-system-monitor', serverUrl),

  getSystemMonitorStatus: () =>
    ipcRenderer.invoke('get-system-monitor-status'),

  // ── EA Scanner ──
  selectEaScannerPaths: () => ipcRenderer.invoke('select-ea-scanner-paths'),
  addEaScannerPath: () => ipcRenderer.invoke('add-ea-scanner-path'),
  getEaScannerPaths: () => ipcRenderer.invoke('get-ea-scanner-paths'),
  clearEaScannerPaths: () => ipcRenderer.invoke('clear-ea-scanner-paths'),
  removeEaScannerPath: (scannerPath: string) => ipcRenderer.invoke('remove-ea-scanner-path', scannerPath),
  runEaScannerScan: () =>
    ipcRenderer.invoke('run-ea-scanner-scan'),

  syncEaScannerBots: (serverUrl: string) =>
    ipcRenderer.invoke('sync-ea-scanner-bots', serverUrl),

  startEaScannerSync: (serverUrl: string, intervalSeconds: number, restStart?: number, restEnd?: number) =>
    ipcRenderer.invoke('start-ea-scanner-sync', serverUrl, intervalSeconds, restStart, restEnd),

  stopEaScannerSync: () =>
    ipcRenderer.invoke('stop-ea-scanner-sync'),

  getEaScannerSyncStatus: () =>
    ipcRenderer.invoke('get-ea-scanner-sync-status'),
});

// ── Type declarations for renderer ──
export interface IPC {
  startProcess: (terminalPath: string) => Promise<{ success: boolean; message: string }>;
  stopProcess: (terminalPath: string) => Promise<{ success: boolean; message: string }>;
  getProcessStatus: (terminalPath: string) => Promise<{ running: boolean; message: string }>;
  getProcessLifecycleStatus: (terminalPath: string) => Promise<{ status: 'running' | 'stopped' | 'missing'; message: string }>;
  getWatcherGroupConfig: () => Promise<{ slots: Array<{ id?: string; name: string; path: string; enabled?: boolean }>; upload: { enabled: boolean; serverUrl: string } }>;
  scanMt5Processes: () => Promise<Array<{ pid: number; executablePath: string; commandLine: string; sessionId?: number }>>;
  runMt5Config: (slots: Array<{ id?: string; name: string; path: string }>) => Promise<{ success: boolean; message?: string; results: Array<{ id?: string; name: string; path: string; running: boolean; started: boolean; success: boolean; message: string; pid?: number }> }>;
  startMt5AutoRestart: (slots: Array<{ id?: string; name: string; path: string }>, intervalSeconds?: number, password?: string) => Promise<{ success: boolean; running: boolean; message: string; configPath?: string }>;
  stopMt5AutoRestart: () => Promise<{ success: boolean; running: boolean; message: string }>;
  getMt5AutoRestartStatus: () => Promise<{ running: boolean; message: string }>;
  getMt5WorkersSnapshot: () => Promise<unknown>;
  getMt5WorkerLogs: (workerId: string) => Promise<string[]>;
  clearMt5WorkerLogs: (workerId: string) => Promise<void>;
  saveMt5WorkerConnection: (connection: unknown) => Promise<unknown>;
  testMt5WorkerServer: (serverUrl: string) => Promise<unknown>;
  verifyMt5WorkerIdentity: (serverUrl: string, apiKey: string) => Promise<unknown>;
  createMt5Worker: (worker?: unknown) => Promise<unknown>;
  updateMt5Worker: (workerId: string, updates: unknown) => Promise<unknown>;
  deleteMt5Worker: (workerId: string) => Promise<void>;
  startMt5Worker: (workerId: string) => Promise<unknown>;
  stopMt5Worker: (workerId: string) => Promise<unknown>;
  restartMt5Worker: (workerId: string) => Promise<unknown>;
  startAllMt5Workers: () => Promise<void>;
  stopAllMt5Workers: () => Promise<void>;
  selectMt5WorkerTerminal: () => Promise<string | null>;
  selectMt5WorkerDirectory: (title?: string, defaultPath?: string) => Promise<string | null>;
  onMt5WorkersState: (callback: (snapshot: unknown) => void) => () => void;
  onMt5WorkerLog: (callback: (entry: { workerId: string; line: string }) => void) => () => void;
  getMt5HistoryConfig: () => Promise<{ success: boolean; data: Mt5HistorySyncConfig }>;
  saveMt5HistoryConfig: (config: Mt5HistorySyncConfig) => Promise<{ success: boolean; message: string; data?: Mt5HistorySyncConfig }>;
  startMt5HistorySync: () => Promise<{ success: boolean; running: boolean; message: string }>;
  stopMt5HistorySync: () => Promise<{ success: boolean; running: boolean; message: string }>;
  resetMt5HistoryState: () => Promise<{ success: boolean; message: string; deleted: number }>;
  getMt5HistorySyncStatus: () => Promise<{ success: boolean; running: boolean }>;
  selectTerminalFolder: () => Promise<string | null>;
  checkPM2Available: () => Promise<boolean>;
  getWatcherUploadConfig: () => Promise<{ success: boolean; message?: string; data: { enabled: boolean; serverUrl: string } }>;
  setWatcherUploadConfig: (upload: { enabled?: boolean; serverUrl?: string }) => Promise<{ success: boolean; message: string; data?: { enabled: boolean; serverUrl: string } }>;
  resyncWatcherUploadState: () => Promise<{ success: boolean; message: string; data?: { cleared: number } }>;
  selectSourceFolder: () => Promise<string | null>;
  selectDestinationFolder: () => Promise<string | null>;
  startBackup: (s: string, d: string, i: number) => Promise<{ success: boolean; message: string }>;
  stopBackup: (sourcePath: string, destPath: string, intervalSeconds: number) => Promise<{ success: boolean; message: string }>;
  getBackupStatus: (sourcePath: string, destPath: string, intervalSeconds: number) => Promise<{ running: boolean; message: string }>;
  getBackupLifecycleStatus: (sourcePath: string, destPath: string, intervalSeconds: number) => Promise<{ status: 'running' | 'stopped' | 'missing'; message: string }>;
  startSystemMonitor: (serverUrl: string, intervalSeconds: number, restStart?: number, restEnd?: number) => Promise<{ success: boolean; message: string }>;
  stopSystemMonitor: (serverUrl: string) => Promise<{ success: boolean; message: string }>;
  getSystemMonitorStatus: () => Promise<{ running: boolean; message: string }>;
  selectEaScannerPaths: () => Promise<{ success: boolean; paths: string[] }>;
  addEaScannerPath: () => Promise<{ success: boolean; path: string | null; paths: string[]; terminalCount: number }>;
  getEaScannerPaths: () => Promise<{ paths: string[]; terminalCount: number }>;
  clearEaScannerPaths: () => Promise<{ success: boolean; paths: string[]; terminalCount: number }>;
  removeEaScannerPath: (scannerPath: string) => Promise<{ success: boolean; paths: string[]; terminalCount: number }>;
  runEaScannerScan: () => Promise<{ success: boolean; message?: string; data: EaScannerScanResult | null }>;
  syncEaScannerBots: (serverUrl: string) => Promise<{ success: boolean; message: string; data?: unknown }>;
  startEaScannerSync: (serverUrl: string, intervalSeconds: number, restStart?: number, restEnd?: number) => Promise<{ success: boolean; message: string }>;
  stopEaScannerSync: () => Promise<{ success: boolean; message: string }>;
  getEaScannerSyncStatus: () => Promise<{ running: boolean; message: string }>;
}

export interface Mt5HistoryAccountConfig {
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
}

export interface Mt5HistorySyncConfig {
  interval_seconds: number;
  state_dir: string;
  accounts: Mt5HistoryAccountConfig[];
}

export interface EaScannerBot {
  machine_id: string;
  pc_name: string;
  user: string;
  cluster: string;
  terminal: string;
  account: string;
  server: string;
  chart_id?: string;
  bot_id: string;
  bot_type: 'EA' | 'HELPER';
  identity_key: string;
  name: string;
  expert_path: string;
  magic: string;
  lot_threshold: number;
  risk_money: number;
  status: string;
  expertmode?: number | null;
  algotrading?: boolean;
  symbol: string;
  tf: string;
  side: string;
  inputs: Record<string, unknown>;
}

export interface EaScannerTerminalReport {
  machine_id: string;
  user: string;
  cluster: string;
  terminal: string;
  account: string;
  server: string;
  group_key: string;
  path: string;
  tpl_count: number;
  active_count: number;
  algotrading?: boolean | null;
  live_snapshot?: boolean;
  realtime_source?: 'SERVICE' | 'CHR_FALLBACK';
  snapshot_status?: 'FRESH' | 'STALE' | 'MISSING' | 'INVALID' | 'UNREADABLE';
  snapshot_age_seconds?: number | null;
  status: 'ok' | 'error';
  chart_config_errors: string[];
  missing_tpl_files: string[];
  wrong_pattern_files: string[];
  extra_chr_bots: string[];
}

export interface EaScannerScanResult {
  pc_name: string;
  machine_id: string;
  timestamp: number;
  active_terminal_count: number;
  message?: string;
  offline_terminals?: EaScannerTerminalReport[];
  terminals: EaScannerTerminalReport[];
  bots: EaScannerBot[];
  summary: {
    total_tpl: number;
    total_active: number;
    total_missing: number;
    total_errors: number;
  };
}

declare global {
  interface Window {
    ipc: IPC;
  }
}

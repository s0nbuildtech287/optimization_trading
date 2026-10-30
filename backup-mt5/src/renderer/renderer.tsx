/**
 * Renderer process - Main React component
 */

import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
require('./styles.css');
import React from 'react';

interface IPC {
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
  getMt5WorkersSnapshot: () => Promise<Mt5WorkersSnapshot>;
  getMt5WorkerLogs: (workerId: string) => Promise<string[]>;
  clearMt5WorkerLogs: (workerId: string) => Promise<void>;
  saveMt5WorkerConnection: (connection: Mt5WorkerConnectionUi) => Promise<Mt5WorkerConnectionUi>;
  testMt5WorkerServer: (serverUrl: string) => Promise<Record<string, unknown>>;
  verifyMt5WorkerIdentity: (serverUrl: string, apiKey: string) => Promise<{ userId: string; label: string }>;
  createMt5Worker: () => Promise<Mt5WorkerViewUi>;
  updateMt5Worker: (workerId: string, updates: Partial<Mt5WorkerViewUi>) => Promise<Mt5WorkerViewUi>;
  deleteMt5Worker: (workerId: string) => Promise<void>;
  startMt5Worker: (workerId: string) => Promise<Mt5WorkerViewUi>;
  stopMt5Worker: (workerId: string) => Promise<Mt5WorkerViewUi>;
  restartMt5Worker: (workerId: string) => Promise<Mt5WorkerViewUi>;
  startAllMt5Workers: () => Promise<void>;
  stopAllMt5Workers: () => Promise<void>;
  selectMt5WorkerTerminal: () => Promise<string | null>;
  selectMt5WorkerDirectory: (title?: string, defaultPath?: string) => Promise<string | null>;
  onMt5WorkersState: (callback: (snapshot: Mt5WorkersSnapshot) => void) => () => void;
  onMt5WorkerLog: (callback: (entry: { workerId: string; line: string }) => void) => () => void;
  getMt5HistoryConfig: () => Promise<{ success: boolean; data: Mt5HistorySyncConfig }>;
  saveMt5HistoryConfig: (config: Mt5HistorySyncConfig) => Promise<{ success: boolean; message: string; data?: Mt5HistorySyncConfig }>;
  startMt5HistorySync: () => Promise<{ success: boolean; running: boolean; message: string }>;
  stopMt5HistorySync: () => Promise<{ success: boolean; running: boolean; message: string }>;
  resetMt5HistoryState: () => Promise<{ success: boolean; message: string; deleted: number }>;
  getMt5HistorySyncStatus: () => Promise<{ success: boolean; running: boolean }>;
  selectTerminalFolder: () => Promise<string | null>;
  selectSourceFolder: () => Promise<string | null>;
  selectDestinationFolder: () => Promise<string | null>;
  checkPM2Available: () => Promise<boolean>;
  getWatcherUploadConfig: () => Promise<{ success: boolean; message?: string; data: { enabled: boolean; serverUrl: string } }>;
  setWatcherUploadConfig: (upload: { enabled?: boolean; serverUrl?: string }) => Promise<{ success: boolean; message: string; data?: { enabled: boolean; serverUrl: string } }>;
  resyncWatcherUploadState: () => Promise<{ success: boolean; message: string; data?: { cleared: number } }>;
  startBackup: (sourcePath: string, destPath: string, intervalSeconds: number) => Promise<{ success: boolean; message: string }>;
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
  syncEaScannerBots: (serverUrl: string) => Promise<{ success: boolean; message: string; data?: { scan?: EaScannerScanResult; post?: { message?: string } } }>;
  startEaScannerSync: (serverUrl: string, intervalSeconds: number, restStart?: number, restEnd?: number) => Promise<{ success: boolean; message: string }>;
  stopEaScannerSync: () => Promise<{ success: boolean; message: string }>;
  getEaScannerSyncStatus: () => Promise<{ running: boolean; message: string }>;
}

interface Mt5HistoryAccountConfig {
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

interface Mt5HistorySyncConfig {
  interval_seconds: number;
  state_dir: string;
  accounts: Mt5HistoryAccountConfig[];
}

interface EaScannerTerminalReport {
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

interface EaScannerScanResult {
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

interface EaScannerBot {
  machine_id: string;
  pc_name: string;
  user: string;
  cluster: string;
  terminal: string;
  account: string;
  server: string;
  terminal_path?: string;
  terminal_group_key?: string;
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

function buildEaScannerSyncPayload(scan: EaScannerScanResult) {
  const reports = [
    ...(scan.terminals || []).map((terminal) => ({
      ...terminal,
      runtimeStatus: 'ONLINE',
      snapshotComplete: terminal.live_snapshot === true || terminal.realtime_source === 'CHR_FALLBACK',
    })),
    ...(scan.offline_terminals || []).map((terminal) => ({
      ...terminal,
      algotrading: null,
      runtimeStatus: 'OFFLINE',
      snapshotComplete: true,
    })),
  ];

  return {
    version: 1,
    scan_timestamp: scan.timestamp,
    machine: {
      machine_id: scan.machine_id,
      pc_name: scan.pc_name,
    },
    terminals: reports.map((terminal) => ({
      terminal_key: `${scan.machine_id}:${terminal.path}`,
      path: terminal.path,
      user: terminal.user,
      cluster: terminal.cluster,
      terminal: terminal.terminal,
      account: terminal.account,
      server: terminal.server,
      algotrading: terminal.algotrading,
      status: terminal.runtimeStatus,
      snapshot_complete: terminal.snapshotComplete,
      realtime_source: terminal.realtime_source,
      snapshot_status: terminal.snapshot_status,
      snapshot_age_seconds: terminal.snapshot_age_seconds,
      bots: terminal.runtimeStatus === 'OFFLINE' ? [] : (scan.bots || [])
        .filter((bot) => (
          bot.terminal_group_key === terminal.group_key
          || bot.terminal_path === terminal.path
        ))
        .map((bot) => ({
          bot_id: bot.bot_id,
          bot_type: bot.bot_type,
          identity_key: bot.identity_key,
          chart_id: bot.chart_id,
          name: bot.name,
          expert_path: bot.expert_path,
          magic: bot.magic,
          lot_threshold: bot.lot_threshold,
          risk_money: bot.risk_money,
          status: bot.status,
          expertmode: bot.expertmode,
          algotrading: bot.algotrading,
          symbol: bot.symbol,
          tf: bot.tf,
          side: bot.side,
          inputs: bot.inputs,
        })),
    })),
  };
}
interface Terminal {
  path: string;
  hash: string;
  status: 'running' | 'stopped' | 'missing' | 'checking';
  watched?: boolean;
}

interface BackupTask {
  sourcePath: string;
  destPath: string;
  intervalSeconds: number;
  status: 'running' | 'stopped' | 'missing' | 'checking';
  id: string;
}

interface Mt5RunningProcess {
  pid: number;
  executablePath: string;
  commandLine: string;
  sessionId?: number;
}

declare global {
  interface Window {
    ipc: IPC;
  }
}

function normalizeWindowsPath(value: string): string {
  return value.replace(/\//g, '\\').toLowerCase();
}

function doesProcessMatchTerminal(processInfo: Mt5RunningProcess, terminalPath: string): boolean {
  const normalizedTerminalPath = normalizeWindowsPath(terminalPath);
  const normalizedExecutable = normalizeWindowsPath(`${terminalPath}\\terminal64.exe`);
  const commandLine = (processInfo.commandLine || '').toLowerCase();
  const executablePath = normalizeWindowsPath(processInfo.executablePath || '');

  return (
    executablePath === normalizedExecutable ||
    executablePath.startsWith(normalizedTerminalPath) ||
    commandLine.includes(normalizedTerminalPath) ||
    commandLine.includes(normalizedExecutable)
  );
}

/** Sample body matching backend/system_monitor.py collect() output (one POST cycle). */
const SYSTEM_MONITOR_SAMPLE_PAYLOAD = {
  machineId: 'DESKTOP-ABC-192.168.1.42',
  timestamp: 1716633600000,
  hostname: 'DESKTOP-ABC',
  platform: 'windows',
  cpu: {
    manufacturer: 'Intel64 Family 6 Model 158 Stepping 10, GenuineIntel',
    brand: 'Intel64 Family 6 Model 158 Stepping 10, GenuineIntel',
    cores: 8,
    physicalCores: 4,
    speed: 3.6,
    currentLoad: 12.5,
  },
  memory: {
    total: 17179869184,
    free: 8589934592,
    used: 8589934592,
    usedPercent: 50.0,
    swapTotal: 4294967296,
    swapUsed: 0,
  },
  disks: [
    {
      device: 'C:\\',
      mount: 'C:\\',
      type: 'NTFS',
      size: 512110190592,
      used: 256055095296,
      available: 256055095296,
      usedPercent: 50.0,
    },
  ],
  session: {
    currentUser: 'GiapDN',
    uptime: 86400,
    bootTime: 1716547200,
    processes: 245,
    activeUsers: [
      {
        name: 'GiapDN',
        sessionName: 'console',
        state: 'Disc',
        sessionId: '1'
      },
    ],
  },
  os: {
    platform: 'windows',
    distro: '10.0.19045',
    release: '10',
    arch: 'AMD64',
    hostname: 'DESKTOP-ABC',
  },
  network: [
    {
      interface: "Ethernet",
      addresses: [
        {
          "type": "ipv4",
          "address": "10.0.6.54",
          "netmask": "255.255.255.0"
        },
        {
          "type": "ipv6",
          "address": "fe80::f720:4849:e64:daf3",
          "netmask": ""
        }
      ],
      "mac": "AA-1C-04-23-CB-3B",
      "isUp": true,
      "speed": 1000,
      "bytesSent": 182040392,
      "bytesRecv": 1918716352,
      "packetsSent": 619437,
      "packetsRecv": 1604864,
      "errorsIn": 0,
      "errorsOut": 0,
      "dropsIn": 0,
      "dropsOut": 0
    },
    {
      "interface": "vEthernet (WSL)",
      "addresses": [
        {
          "type": "ipv4",
          "address": "172.19.80.1",
          "netmask": "255.255.240.0"
        },
        {
          "type": "ipv6",
          "address": "fe80::d578:2495:55d7:9cca",
          "netmask": ""
        }
      ],
      "mac": "00-15-5D-32-2F-7B",
      "isUp": true,
      "speed": 4294,
      "bytesSent": 63891,
      "bytesRecv": 9553,
      "packetsSent": 546,
      "packetsRecv": 118,
      "errorsIn": 0,
      "errorsOut": 0,
      "dropsIn": 0,
      "dropsOut": 0
    }
  ],
  "networkStats": {
    "totalBytesSent": 182104283,
    "totalBytesRecv": 1918725905,
    "uploadSpeed": 4.6,
    "downloadSpeed": 114.01,
    "activeConnections": 145,
    "tcpEstablished": 19,
    "tcpListen": 38
  },
  "networkSummary": {
    "primaryIP": "10.0.6.54",
    "publicIP": "116.98.42.149",
    "interfaceCount": 2,
    "vpnDetected": true,
    "virtualAdapters": [
      "vEthernet (WSL)"
    ]
  },
} as const;

const SYSTEM_MONITOR_DEFAULT_PATH = '/api/v1/system-monitor/ingest';

function formatSystemMonitorPostExample(serverUrl: string): string {
  const { machineId } = SYSTEM_MONITOR_SAMPLE_PAYLOAD;
  let origin = serverUrl.trim().replace(/\/$/, '');
  try {
    const u = new URL(origin);
    origin = u.origin;
  } catch {
    // Keep as typed if it is not yet a valid absolute URL.
  }
  const ingestUrl = origin + SYSTEM_MONITOR_DEFAULT_PATH;
  return [
    `POST ${ingestUrl}`,
    'Content-Type: application/json',
    `User-Agent: SystemMonitor/${machineId}`,
    'X-Agent-API-Key: <from SYSTEM_MONITOR_API_KEY in .env>',
    '',
    JSON.stringify(SYSTEM_MONITOR_SAMPLE_PAYLOAD, null, 2),
  ].join('\n');
}

const SystemMonitorTab = () => {
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      return localStorage.getItem('systemMonitorServerUrl') || 'https://your-server.com';
    } catch {
      return 'https://your-server.com';
    }
  });

  const [intervalSeconds, setIntervalSeconds] = useState(() => {
    try {
      return localStorage.getItem('systemMonitorInterval') || '60';
    } catch {
      return '60';
    }
  });

  const [restStart, setRestStart] = useState(() => {
    try {
      return localStorage.getItem('systemMonitorRestStart') || '55';
    } catch {
      return '55';
    }
  });

  const [restEnd, setRestEnd] = useState(() => {
    try {
      return localStorage.getItem('systemMonitorRestEnd') || '5';
    } catch {
      return '5';
    }
  });

  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [actionState, setActionState] = useState<'idle' | 'starting' | 'stopping'>('idle');
  const actionStateRef = useRef<'idle' | 'starting' | 'stopping'>('idle');

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    actionStateRef.current = actionState;
  }, [actionState]);

  useEffect(() => {
    try {
      localStorage.setItem('systemMonitorServerUrl', serverUrl);
      localStorage.setItem('systemMonitorInterval', intervalSeconds);
      localStorage.setItem('systemMonitorRestStart', restStart);
      localStorage.setItem('systemMonitorRestEnd', restEnd);
    } catch {
      // Ignore
    }
  }, [serverUrl, intervalSeconds, restStart, restEnd]);

  const checkStatus = async () => {
    if (actionStateRef.current !== 'idle') {
      return;
    }
    try {
      const result = await window.ipc.getSystemMonitorStatus();
      setIsRunning(result.running);
      setStatusMessage(result.message);
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message || err}`);
    }
  };

  const handleStart = async () => {
    if (actionStateRef.current !== 'idle') {
      return;
    }

    const interval = parseInt(intervalSeconds, 10);
    if (isNaN(interval) || interval < 1 || interval > 3600) {
      alert('Interval must be between 1 and 3600 seconds');
      return;
    }

    const restStartNum = parseInt(restStart, 10);
    const restEndNum = parseInt(restEnd, 10);
    if (isNaN(restStartNum) || restStartNum < 0 || restStartNum > 59) {
      alert('Rest start must be between 0 and 59');
      return;
    }
    if (isNaN(restEndNum) || restEndNum < 0 || restEndNum > 59) {
      alert('Rest end must be between 0 and 59');
      return;
    }

    if (!serverUrl.trim()) {
      alert('Server URL is required');
      return;
    }

    // Validate URL
    try {
      new URL(serverUrl);
    } catch {
      alert('Invalid server URL. Must start with http:// or https://');
      return;
    }

    setActionState('starting');
    setStatusMessage('Starting system monitor...');
    try {
      console.log('[SystemMonitor] Starting with config:', { serverUrl, interval, restStartNum, restEndNum });
      const result = await window.ipc.startSystemMonitor(serverUrl, interval, restStartNum, restEndNum);
      console.log('[SystemMonitor] Start result:', result);
      if (result.success) {
        setIsRunning(true);
        setStatusMessage('System monitor started successfully');
      } else {
        alert(result.message);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    } finally {
      setActionState('idle');
      await checkStatus();
    }
  };

  const handleStop = async () => {
    if (actionStateRef.current !== 'idle') {
      return;
    }

    setActionState('stopping');
    setStatusMessage('Stopping system monitor...');
    try {
      const result = await window.ipc.stopSystemMonitor(serverUrl);
      if (result.success) {
        setIsRunning(false);
        setStatusMessage(result.message || 'System monitor stopped');
      } else {
        alert(result.message);
      }
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    } finally {
      setActionState('idle');
      await checkStatus();
    }
  };

  return (
    <div className="monitor-tab">
      <div className="monitor-header">
        <h2>🖥️ System Monitor</h2>
        <p className="monitor-description">
          Automatically collect and send system information (CPU, memory, disk, sessions) to a remote server for monitoring.
          Each hour, collection and POST pause during local minutes :55-:05 so the machine can focus on other tasks.
        </p>
      </div>

      <div className="monitor-status-card">
        <div className="monitor-status-row">
          <span className="monitor-status-label">Status:</span>
          <span className={`status-badge ${isRunning ? 'running' : 'stopped'}`}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="monitor-status-message">{statusMessage}</div>
      </div>

      <div className="monitor-config-panel">
        <h3>Configuration</h3>

        <div className="monitor-field">
          <label htmlFor="serverUrl">Server URL:</label>
          <input
            id="serverUrl"
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            disabled={isRunning || actionState !== 'idle'}
            placeholder="https://your-server.com"
            className="monitor-input"
          />
          <span className="monitor-hint">Just enter the root domain. The app will send to <code>{SYSTEM_MONITOR_DEFAULT_PATH}</code>.</span>
        </div>

        <div className="monitor-field">
          <label htmlFor="interval">Interval (seconds):</label>
          <input
            id="interval"
            type="number"
            min="1"
            max="3600"
            value={intervalSeconds}
            onChange={(e) => setIntervalSeconds(e.target.value)}
            disabled={isRunning || actionState !== 'idle'}
            className="monitor-input-small"
          />
          <span className="monitor-hint">How often to collect and send data (1-3600 seconds).</span>
        </div>

        <div className="monitor-field">
          <label>Rest period (minutes per hour):</label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="restStart" style={{ fontSize: '12px', color: '#666' }}>Start (0-59):</label>
              <input
                id="restStart"
                type="number"
                min="0"
                max="59"
                value={restStart}
                onChange={(e) => setRestStart(e.target.value)}
                disabled={isRunning || actionState !== 'idle'}
                className="monitor-input-small"
                style={{ width: '80px' }}
              />
            </div>
            <span style={{ marginTop: '20px' }}>-&gt;</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="restEnd" style={{ fontSize: '12px', color: '#666' }}>End (0-59):</label>
              <input
                id="restEnd"
                type="number"
                min="0"
                max="59"
                value={restEnd}
                onChange={(e) => setRestEnd(e.target.value)}
                disabled={isRunning || actionState !== 'idle'}
                className="monitor-input-small"
                style={{ width: '80px' }}
              />
            </div>
          </div>
          <span className="monitor-hint">
            {(() => {
              const start = parseInt(restStart, 10);
              const end = parseInt(restEnd, 10);
              if (isNaN(start) || isNaN(end)) return 'Enter valid minutes (0-59)';

              let duration: number;
              let warning = '';

              if (start === end) {
                // start == end -> only rest at that minute (1 minute each hour)
                duration = 1;
              } else if (start > end) {
                duration = (60 - start) + end + 1;
                if (duration >= 59) {
                  warning = ' Warning: almost a full hour!';
                }
              } else {
                duration = end - start + 1;
              }

              return (
                <>
                  No data collection during :{restStart.padStart(2, '0')}-{restEnd.padStart(2, '0')} each hour ({duration} min{duration > 1 ? 's' : ''}{warning}).
                  {'\n'}
                  Example: 55-&gt;5 = 16 min, 45-&gt;45 = 1 min (only at :45).
                </>
              );
            })()}
          </span>
        </div>

        <div className="monitor-actions">
          <button
            className="btn btn-success"
            onClick={handleStart}
            disabled={isRunning || actionState !== 'idle'}
          >
            {actionState === 'starting' ? '⌛ Starting...' : '▶ Start Monitor'}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleStop}
            disabled={!isRunning || actionState !== 'idle'}
          >
            {actionState === 'stopping' ? '⌛ Stopping...' : '⏹ Stop Monitor'}
          </button>
        </div>
      </div>

      <div className="monitor-info-panel">
        <h3>Collected Information</h3>
        <div className="monitor-info-grid">
          <div className="monitor-info-item">
            <strong>CPU:</strong>
            <ul>
              <li>Manufacturer, brand, core count</li>
              <li>Current speed and load</li>
              <li>Temperature, if available</li>
            </ul>
          </div>
          <div className="monitor-info-item">
            <strong>Memory:</strong>
            <ul>
              <li>Total, used, free</li>
              <li>Usage percentage</li>
              <li>Swap</li>
            </ul>
          </div>
          <div className="monitor-info-item">
            <strong>Disk:</strong>
            <ul>
              <li>All mounted drives</li>
              <li>Size, used, available</li>
              <li>Usage percentage</li>
            </ul>
          </div>
          <div className="monitor-info-item">
            <strong>Session:</strong>
            <ul>
              <li>Current user</li>
              <li>Active users and login times</li>
              <li>System uptime</li>
            </ul>
          </div>
          <div className="monitor-info-item">
            <strong>System:</strong>
            <ul>
              <li>OS platform and version</li>
              <li>Hostname and architecture</li>
              <li>Top 10 processes (CPU/Memory)</li>
            </ul>
          </div>
          <div className="monitor-info-item">
            <strong>Network:</strong>
            <ul>
              <li>All network interfaces and IPs</li>
              <li>Upload/download speed</li>
              <li>Active connections and statistics</li>
            </ul>
          </div>
        </div>
      </div>

      {/* <div className="monitor-example-panel">
        <h3>POST body (full structure)</h3>
        <p className="monitor-hint">
          Sent every interval as <code>application/json</code> with <code>X-Agent-API-Key</code> from project <code>.env</code>.
          <code>machineId</code> is <code>hostname-IPv4</code> (persisted in temp state file).
        </p>
        <pre className="monitor-code">{formatSystemMonitorPostExample(serverUrl)}</pre>
      </div> */}
    </div>
  );
};

const Mt5PathConfigTab = ({ onCountChange }: { onCountChange?: (count: number) => void }) => {
  type SlotItem = { id: string; name: string; path: string };
  type Mt5Process = { pid: number; executablePath: string; commandLine: string; sessionId?: number };

  const makeSlotName = (index: number): string => `MT5_${index + 1}`;
  const makeSlotId = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const loadSlots = (): SlotItem[] => {
    const fallback: SlotItem[] = [];

    try {
      const saved = localStorage.getItem('mt5TerminalSlots');
      if (!saved) return fallback;

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const savedSlots = parsed.map((item, index) => ({
          id: item.id || makeSlotId(),
          name: item.name || makeSlotName(index),
          path: item.path || '',
        }));
        const isOldExample = (slot: SlotItem) =>
          slot.name === 'MT5_1' &&
          slot.path.replace(/\//g, '\\').toLowerCase() === 'c:\\users\\trader3\\desktop\\mt5\\mt5-01\\terminal64.exe';
        return savedSlots.filter((slot) => slot.path.trim() && !isOldExample(slot));
      }

      if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed).map(([name, pathValue]) => ({
          id: makeSlotId(),
          name,
          path: String(pathValue || ''),
        })).filter((slot) => slot.path.trim());
      }
    } catch { /* ignore */ }

    return fallback;
  };

  const [slots, setSlots] = useState<SlotItem[]>(loadSlots);
  const [statusMessage, setStatusMessage] = useState('Set terminal64.exe paths for each slot and save them locally.');
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [lastScanCount, setLastScanCount] = useState<number | null>(null);
  const [autoRestartRunning, setAutoRestartRunning] = useState(false);
  const [autoRestartMessage, setAutoRestartMessage] = useState('Auto restart is stopped.');
  const [autoRestartLoading, setAutoRestartLoading] = useState(false);
  const [autoRestartPassword, setAutoRestartPassword] = useState('');

  useEffect(() => {
    onCountChange?.(slots.filter((slot) => slot.path.trim()).length);
  }, [slots, onCountChange]);

  useEffect(() => {
    try {
      localStorage.setItem('mt5TerminalSlots', JSON.stringify(slots));
    } catch {
      // ignore
    }
  }, [slots]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const result = await window.ipc.getMt5AutoRestartStatus();
        setAutoRestartRunning(result.running);
        setAutoRestartMessage(result.message);
      } catch {
        // ignore
      }
    };

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  const updateSlot = (id: string, value: string) => {
    setSlots((prev) => prev.map((slot) => (slot.id === id ? { ...slot, path: value } : slot)));
  };

  const normalizePath = (value: string) => value.replace(/\//g, '\\').replace(/\\+$/g, '').toLowerCase();

  const getDisplayNameFromExePath = (exePath: string): string => {
    const normalized = normalizePath(exePath);
    const terminalDir = normalized.replace(/\\terminal64\.exe$/i, '');
    const parts = terminalDir.split('\\').filter(Boolean);
    const folderName = parts[parts.length - 1] || 'MT5';
    const usersIndex = parts.findIndex((part) => part === 'users');
    const userName = usersIndex >= 0 ? parts[usersIndex + 1] : '';
    return userName ? `${folderName}_${userName}` : folderName;
  };

  const hasSlotPath = (pathValue: string) => {
    const target = normalizePath(pathValue);
    return slots.some((slot) => normalizePath(slot.path) === target);
  };

  const clearSlot = (id: string) => {
    updateSlot(id, '');
  };

  const fillExample = (slot: SlotItem) => {
    const idx = slot.name.replace('MT5_', '');
    updateSlot(slot.id, `C:\\Users\\trader3\\Desktop\\mt5\\MT5-${idx}\\terminal64.exe`);
    setStatusMessage(`Filled example path for ${slot.name}.`);
  };

  const addSlot = () => {
    setSlots((prev) => {
      const nextIndex = prev.length + 1;
      return [...prev, { id: makeSlotId(), name: makeSlotName(nextIndex), path: '' }];
    });
    setStatusMessage('Added new slot.');
  };

  const syncAutoRestartConfig = async (nextSlots: SlotItem[]) => {
    if (!autoRestartRunning) return;
    try {
      await window.ipc.startMt5AutoRestart(nextSlots, 10, autoRestartPassword);
      setAutoRestartMessage('Auto restart config updated.');
    } catch (err: any) {
      setAutoRestartMessage(`Auto restart update failed: ${err?.message || err}`);
    }
  };

  const scanAndAddRunningMt5 = async () => {
    setScanLoading(true);
    try {
      const processes: Mt5Process[] = await window.ipc.scanMt5Processes();
      const mt5Paths = processes
        .map((proc) => String(proc.executablePath || '').trim())
        .filter((exePath) => exePath && /terminal64\.exe$/i.test(exePath));
      setLastScanCount(mt5Paths.length);

      const uniqueNewSlots: SlotItem[] = [];
      for (const exePath of mt5Paths) {
        if (hasSlotPath(exePath)) continue;
        uniqueNewSlots.push({
          id: makeSlotId(),
          name: getDisplayNameFromExePath(exePath),
          path: exePath,
        });
      }

      if (uniqueNewSlots.length === 0) {
        setStatusMessage(`Auto scan found ${mt5Paths.length} running MT5 terminal(s), but no new ones were added.`);
        return;
      }

      const nextSlots = [...slots, ...uniqueNewSlots];
      setSlots(nextSlots);
      setStatusMessage(`Auto scan found ${mt5Paths.length} running MT5 terminal(s) and added ${uniqueNewSlots.length} new slot(s).`);
      await syncAutoRestartConfig(nextSlots);
    } catch (err: any) {
      setStatusMessage(`Scan failed: ${err?.message || err}`);
    } finally {
      setScanLoading(false);
    }
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((slot) => slot.id !== id));
    setStatusMessage('Removed slot.');
  };

  const clearAllSlots = async () => {
    setSlots([]);
    setLastScanCount(null);
    setStatusMessage('Cleared all MT5 slots.');

    if (autoRestartRunning) {
      try {
        await window.ipc.startMt5AutoRestart([], 10, autoRestartPassword);
        setAutoRestartMessage('Auto restart config updated.');
      } catch (err: any) {
        setAutoRestartMessage(`Auto restart update failed: ${err?.message || err}`);
      }
    }
  };

  const startAutoRestart = async () => {
    if (!autoRestartPassword) {
      setStatusMessage('Please enter the Windows account password before starting auto restart.');
      return;
    }
    setAutoRestartLoading(true);
    try {
      const result = await window.ipc.startMt5AutoRestart(slots, 10, autoRestartPassword);
      setAutoRestartRunning(result.running);
      setAutoRestartMessage(result.message);
      setStatusMessage(result.message);
    } catch (err: any) {
      setAutoRestartMessage(`Failed to start auto restart: ${err?.message || err}`);
    } finally {
      setAutoRestartLoading(false);
    }
  };

  const stopAutoRestart = async () => {
    setAutoRestartLoading(true);
    try {
      const result = await window.ipc.stopMt5AutoRestart();
      setAutoRestartRunning(result.running);
      setAutoRestartMessage(result.message);
      setStatusMessage(result.message);
    } catch (err: any) {
      setAutoRestartMessage(`Failed to stop auto restart: ${err?.message || err}`);
    } finally {
      setAutoRestartLoading(false);
    }
  };

  return (
    <div className="monitor-tab">
      <div className="monitor-header">
        <h2>MT5 Auto Run</h2>
        <p className="monitor-description">
          Enter each path manually, for example <code>MT5_1=C:\Users\trader3\Desktop\mt5\MT5-01\terminal64.exe</code>.
          The app only stores this config locally so you can use it for scripts or manual reference.
        </p>
      </div>

      <div className="monitor-status-card">
        <div className="monitor-status-message">{statusMessage}</div>
        <div className="monitor-hint" style={{ marginTop: 6 }}>{autoRestartMessage}</div>
        <div className="monitor-hint" style={{ marginTop: 6 }}>
          Auto scan result: {lastScanCount === null ? 'not scanned yet' : `${lastScanCount} MT5 terminal(s) found`}
        </div>
        <div style={{ marginTop: 12, maxWidth: 420 }}>
          <label htmlFor="autoRestartPassword" className="monitor-input-label">Windows account password</label>
          <input
            id="autoRestartPassword"
            type="password"
            value={autoRestartPassword}
            onChange={(e) => setAutoRestartPassword(e.target.value)}
            placeholder="Enter password for the MT5 Windows account"
            className="monitor-input"
            disabled={autoRestartLoading || scanLoading}
            autoComplete="new-password"
          />
          <div className="monitor-hint" style={{ marginTop: 4 }}>
            Used when MT5 must be started in another Windows user session.
          </div>
        </div>
        <div className="monitor-actions" style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={addSlot}>+ Add slot</button>
          <button className="btn btn-secondary" onClick={scanAndAddRunningMt5} disabled={scanLoading}>
            {scanLoading ? 'Scanning...' : 'Scan running MT5'}
          </button>
          <button className="btn btn-warning" onClick={clearAllSlots} disabled={loading || scanLoading || slots.length === 0}>
            Clear all
          </button>
          {!autoRestartRunning ? (
            <button className="btn btn-success" onClick={startAutoRestart} disabled={autoRestartLoading || slots.length === 0}>
              {autoRestartLoading ? 'Starting...' : 'Start auto restart'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={stopAutoRestart} disabled={autoRestartLoading}>
              {autoRestartLoading ? 'Stopping...' : 'Stop auto restart'}
            </button>
          )}
        </div>
      </div>

      <div className="monitor-info-panel">
        <h3>Slot list</h3>
        <div className="backups-list">
          {slots.map((slot, index) => (
            <div key={slot.id} className="backup-card">
              <div className="backup-info">
                <div className="backup-source" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{slot.name}</strong>
                   <button className="btn btn-danger" onClick={() => removeSlot(slot.id)} title="Remove slot">Remove</button>
                </div>
                <div className="backup-dest">
                  <input
                    type="text"
                    value={slot.path}
                    onChange={(e) => updateSlot(slot.id, e.target.value)}
                    placeholder={`C:\\Users\\trader3\\Desktop\\mt5\\MT5-${String(index + 1).padStart(2, '0')}\\terminal64.exe`}
                    className="monitor-input"
                  />
                </div>
              </div>
              <div className="backup-status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={() => fillExample(slot)}>Example</button>
                  <button className="btn btn-warning" onClick={() => clearSlot(slot.id)}>Clear</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Mt5RunCheckTab = ({ terminals, onRemove }: { terminals: Terminal[]; onRemove?: (terminalPath: string) => void }) => {
  const [runningProcesses, setRunningProcesses] = useState<Mt5RunningProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Click Refresh to scan terminal64.exe processes.');

  const refreshScan = async () => {
    setLoading(true);
    try {
      const processes = await window.ipc.scanMt5Processes();
      setRunningProcesses(processes);
      setStatusMessage(`Found ${processes.length} terminal64.exe process(es).`);
    } catch (err: any) {
      setStatusMessage(`Scan failed: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshScan();
    const timer = setInterval(() => {
      void refreshScan();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const rows = terminals.map((terminal) => {
    const matches = runningProcesses.filter((proc) => doesProcessMatchTerminal(proc, terminal.path));
    const primary = matches[0];
    return {
      ...terminal,
      running: matches.length > 0,
      pidText: matches.length > 0 ? matches.map((p) => p.pid).join(', ') : 'N/A',
      exeText: primary?.executablePath || 'N/A',
      cmdText: primary?.commandLine || 'N/A',
    };
  });

  return (
    <div className="monitor-tab">
      <div className="monitor-header">
        <h2>MT5 Auto Run Check</h2>
        <p className="monitor-description">
          Scan all running <code>terminal64.exe</code> processes on the machine and match them against saved MT5 folders.
          This is useful when terminals run under different Windows users.
        </p>
      </div>

      <div className="monitor-status-card">
        <div className="monitor-status-row">
          <span className="monitor-status-label">Status:</span>
          <span className={`status-badge ${runningProcesses.length > 0 ? 'running' : 'stopped'}`}>
            {runningProcesses.length > 0 ? 'Processes found' : 'No MT5 running'}
          </span>
        </div>
        <div className="monitor-status-message">{statusMessage}</div>
        <div className="monitor-actions" style={{ marginTop: 12 }}>
          <button className="btn btn-success" onClick={refreshScan} disabled={loading}>
            {loading ? 'Scanning...' : 'Refresh scan'}
          </button>
        </div>
      </div>

      <div className="monitor-info-panel">
        <h3>Saved terminals</h3>
        {terminals.length === 0 ? (
          <p className="monitor-hint">No terminals saved yet. Add MT5 terminals in the Log Watcher tab first.</p>
        ) : (
          <div className="backups-list">
            {rows.map((row) => (
              <div key={row.path} className="backup-card">
                <div className="backup-info">
                  <div className="backup-source"><strong>Terminal:</strong> {row.path}</div>
                  <div className="backup-dest"><strong>Status:</strong> {row.running ? 'Running' : 'Stopped'}</div>
                  <div className="backup-interval"><strong>PID:</strong> {row.pidText}</div>
                  <div className="backup-interval"><strong>Exe:</strong> {row.exeText}</div>
                </div>
                <div className="backup-status">
                  <span className={`status-badge ${row.running ? 'running' : 'stopped'}`}>
                    {row.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="backup-actions">
                  <button className="btn btn-secondary" onClick={() => onRemove?.(row.path)} disabled={loading || !onRemove}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="monitor-info-panel">
        <h3>Detected terminal64.exe</h3>
        {runningProcesses.length === 0 ? (
          <p className="monitor-hint">No terminal64.exe processes detected right now.</p>
        ) : (
          <div className="backups-list">
            {runningProcesses.map((proc) => (
              <div key={proc.pid} className="backup-card">
                <div className="backup-info">
                  <div className="backup-source"><strong>PID:</strong> {proc.pid}</div>
                  <div className="backup-dest"><strong>Executable:</strong> {proc.executablePath || 'N/A'}</div>
                  <div className="backup-interval"><strong>Command:</strong> {proc.commandLine || 'N/A'}</div>
                </div>
                <div className="backup-status">
                  <span className="status-badge running">Running</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

type WorkerProfileStatus = 'offline' | 'online' | 'starting' | 'stopping' | 'error';

interface Mt5WorkerConnectionUi {
  serverUrl: string;
  apiKey: string;
  heartbeatSeconds: number;
  pollSeconds: number;
  serverHealthTimeout: number;
  serverHealthInterval: number;
  maxAttempts: number;
  retryDelay: number;
  postExitGrace: number;
}

interface Mt5WorkerViewUi {
  id: string;
  workerInstanceId: string;
  workerName: string;
  terminalPath: string;
  terminalDataPath: string;
  strategiesDir: string;
  workspaceRoot: string;
  autoStart: boolean;
  status: WorkerProfileStatus;
  activity: 'idle' | 'running';
  currentJob: string | null;
  jobsClaimed: number;
  pid: number | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Mt5WorkersSnapshot {
  connection: Mt5WorkerConnectionUi;
  workers: Mt5WorkerViewUi[];
}

interface WorkerProfileDraft {
  id: string;
  workerName: string;
  terminalPath: string;
  dataPath: string;
  strategiesPath: string;
  workspacePath: string;
  autoStart: boolean;
  status: WorkerProfileStatus;
  activity: 'idle' | 'running';
  currentJob: string;
  jobsClaimed: number;
}

const workerViewToDraft = (worker: Mt5WorkerViewUi): WorkerProfileDraft => ({
  id: worker.id,
  workerName: worker.workerName,
  terminalPath: worker.terminalPath,
  dataPath: worker.terminalDataPath,
  strategiesPath: worker.strategiesDir,
  workspacePath: worker.workspaceRoot,
  autoStart: worker.autoStart,
  status: worker.status,
  activity: worker.activity,
  currentJob: worker.currentJob || '',
  jobsClaimed: worker.jobsClaimed,
});

const Mt5WorkersTab = () => {
  const [serverUrl, setServerUrl] = useState('http://127.0.0.1:5000');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionState, setConnectionState] = useState<'unchecked' | 'healthy' | 'verified'>('unchecked');
  const [identity, setIdentity] = useState({ userId: '-', label: '-' });
  const [connection, setConnection] = useState<Mt5WorkerConnectionUi | null>(null);
  const [profiles, setProfiles] = useState<WorkerProfileDraft[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const logConsoleRef = useRef<HTMLDivElement>(null);
  const followLatestLogsRef = useRef(true);

  const applySnapshot = (snapshot: Mt5WorkersSnapshot) => {
    const nextProfiles = snapshot.workers.map(workerViewToDraft);
    setProfiles(nextProfiles);
    setConnection(snapshot.connection);
    setServerUrl(snapshot.connection.serverUrl);
    setApiKey(snapshot.connection.apiKey);
    setSelectedProfileId((current) => nextProfiles.some((worker) => worker.id === current) ? current : (nextProfiles[0]?.id ?? ''));
  };

  useEffect(() => {
    let active = true;
    window.ipc.getMt5WorkersSnapshot()
      .then((snapshot) => { if (active) applySnapshot(snapshot); })
      .catch((error) => { if (active) setErrorMessage(error instanceof Error ? error.message : String(error)); });
    const removeStateListener = window.ipc.onMt5WorkersState((snapshot) => { if (active) applySnapshot(snapshot); });
    const removeLogListener = window.ipc.onMt5WorkerLog(({ workerId, line }) => {
      if (!active) return;
      setLogs((current) => ({ ...current, [workerId]: [...(current[workerId] ?? []), line].slice(-500) }));
    });
    return () => {
      active = false;
      removeStateListener();
      removeLogListener();
    };
  }, []);

  useEffect(() => {
    if (!selectedProfileId) return;
    window.ipc.getMt5WorkerLogs(selectedProfileId)
      .then((lines) => setLogs((current) => ({ ...current, [selectedProfileId]: lines })))
      .catch((error) => setErrorMessage(error instanceof Error ? error.message : String(error)));
  }, [selectedProfileId]);

  const selectedLogCount = selectedProfileId ? (logs[selectedProfileId]?.length ?? 0) : 0;

  useEffect(() => {
    followLatestLogsRef.current = true;
    const frameId = window.requestAnimationFrame(() => {
      const consoleElement = logConsoleRef.current;
      if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [selectedProfileId]);

  useEffect(() => {
    if (!followLatestLogsRef.current) return;
    const frameId = window.requestAnimationFrame(() => {
      const consoleElement = logConsoleRef.current;
      if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [selectedLogCount]);

  const handleLogScroll = () => {
    const consoleElement = logConsoleRef.current;
    if (!consoleElement) return;
    const distanceFromBottom = consoleElement.scrollHeight - consoleElement.clientHeight - consoleElement.scrollTop;
    followLatestLogsRef.current = distanceFromBottom <= 24;
  };

  const scrollLogsToLatest = () => {
    followLatestLogsRef.current = true;
    const consoleElement = logConsoleRef.current;
    if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
  };

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0];
  const onlineCount = profiles.filter((profile) => profile.status === 'online').length;
  const runningCount = profiles.filter((profile) => profile.activity === 'running').length;
  const autoStartCount = profiles.filter((profile) => profile.autoStart).length;

  const updateProfile = (profileId: string, updates: Partial<WorkerProfileDraft>) => {
    setProfiles((current) => current.map((profile) => profile.id === profileId ? { ...profile, ...updates } : profile));
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setErrorMessage('');
    try {
      await action();
      applySnapshot(await window.ipc.getMt5WorkersSnapshot());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const saveConnection = async () => {
    const next = {
      ...(connection || {
        heartbeatSeconds: 15, pollSeconds: 10, serverHealthTimeout: 60,
        serverHealthInterval: 3, maxAttempts: 2, retryDelay: 3, postExitGrace: 30,
      }),
      serverUrl,
      apiKey,
    } as Mt5WorkerConnectionUi;
    const saved = await window.ipc.saveMt5WorkerConnection(next);
    setConnection(saved);
  };

  const addProfile = () => runAction(async () => {
    await saveConnection();
    const worker = await window.ipc.createMt5Worker();
    setSelectedProfileId(worker.id);
  });

  const deleteProfile = (profileId: string) => {
    if (!window.confirm('Delete this worker configuration?')) return;
    void runAction(() => window.ipc.deleteMt5Worker(profileId));
  };

  const saveProfile = async (profile: WorkerProfileDraft) => {
    await window.ipc.updateMt5Worker(profile.id, {
      workerName: profile.workerName,
      terminalPath: profile.terminalPath,
      terminalDataPath: profile.dataPath,
      strategiesDir: profile.strategiesPath,
      workspaceRoot: profile.workspacePath,
      autoStart: profile.autoStart,
    });
  };

  const setWorkerRunning = (profile: WorkerProfileDraft, running: boolean) => {
    void runAction(async () => {
      if (running) {
        await saveConnection();
        await saveProfile(profile);
        await window.ipc.startMt5Worker(profile.id);
      } else {
        await window.ipc.stopMt5Worker(profile.id);
      }
    });
  };

  const startAll = () => void runAction(async () => {
    await saveConnection();
    for (const profile of profiles.filter((item) => item.status === 'offline' || item.status === 'error')) {
      await saveProfile(profile);
    }
    await window.ipc.startAllMt5Workers();
  });
  const stopAll = () => void runAction(() => window.ipc.stopAllMt5Workers());

  const restartProfile = (profile: WorkerProfileDraft) => void runAction(async () => {
    await saveConnection();
    await window.ipc.stopMt5Worker(profile.id);
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    await saveProfile(profile);
    await window.ipc.startMt5Worker(profile.id);
  });

  const testServer = () => void runAction(async () => {
    await saveConnection();
    await window.ipc.testMt5WorkerServer(serverUrl);
    setConnectionState('healthy');
  });

  const verifyIdentity = () => void runAction(async () => {
    await saveConnection();
    const result = await window.ipc.verifyMt5WorkerIdentity(serverUrl, apiKey);
    setIdentity(result);
    setConnectionState('verified');
  });

  const browseTerminal = async (profile: WorkerProfileDraft) => {
    const selected = await window.ipc.selectMt5WorkerTerminal();
    if (selected) updateProfile(profile.id, { terminalPath: selected });
  };

  const browseDirectory = async (profile: WorkerProfileDraft, field: 'dataPath' | 'strategiesPath' | 'workspacePath', title: string) => {
    const selected = await window.ipc.selectMt5WorkerDirectory(title, profile[field]);
    if (selected) updateProfile(profile.id, { [field]: selected });
  };

  const copyLogs = async () => {
    if (!selectedProfile) return;
    await navigator.clipboard.writeText((logs[selectedProfile.id] ?? []).join('\n'));
  };

  return (
    <div className="mt5-workers-tab">
      <div className="worker-page-heading">
        <div>
          <h2>MT5 Workers</h2>
          <p>Manage isolated workers for multiple MetaTrader 5 terminals.</p>
        </div>
        <div className="worker-heading-actions">
          <button className="btn btn-success" onClick={startAll} disabled={busy || profiles.length === 0}>Start All</button>
          <button className="btn btn-danger" onClick={stopAll} disabled={busy || profiles.length === 0}>Stop All</button>
          <button className="btn btn-primary" onClick={addProfile} disabled={busy}>+ Add Worker</button>
        </div>
      </div>

      {errorMessage && <div className="worker-error-banner"><span>{errorMessage}</span><button onClick={() => setErrorMessage('')}>Close</button></div>}

      <div className="worker-summary-grid">
        <div className="worker-summary-card"><span>Workers</span><strong>{profiles.length}</strong><small>Configured terminals</small></div>
        <div className="worker-summary-card status-online"><span>Online</span><strong>{onlineCount}</strong><small>Connected workers</small></div>
        <div className="worker-summary-card status-running"><span>Running Jobs</span><strong>{runningCount}</strong><small>Active executions</small></div>
        <div className="worker-summary-card status-autostart"><span>Auto Start</span><strong>{autoStartCount}</strong><small>Enabled workers</small></div>
      </div>

      <section className="worker-section">
        <div className="worker-section-heading">
          <div><h3>Connection & Identity</h3><p>Shared server connection for every worker.</p></div>
          <span className={`worker-connection-badge ${connectionState}`}>{connectionState === 'verified' ? 'Identity Verified' : connectionState === 'healthy' ? 'Server Healthy' : 'Not Tested'}</span>
        </div>
        <div className="worker-connection-grid">
          <label className="worker-field worker-server-field"><span>Server URL</span><input value={serverUrl} onChange={(event) => { setServerUrl(event.target.value); setConnectionState('unchecked'); }} placeholder="http://127.0.0.1:5000" /></label>
          <label className="worker-field worker-key-field"><span>API Key</span><div className="worker-input-action"><input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(event) => { setApiKey(event.target.value); setConnectionState('unchecked'); }} placeholder="Enter worker API key" /><button type="button" title={showApiKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowApiKey((current) => !current)}>{showApiKey ? 'Hide' : 'Show'}</button></div></label>
          <div className="worker-connection-actions"><button className="btn btn-secondary" onClick={testServer} disabled={busy || !serverUrl.trim()}>Test Server</button><button className="btn btn-primary" onClick={verifyIdentity} disabled={busy || !serverUrl.trim() || !apiKey.trim()}>Verify Identity</button></div>
        </div>
        <div className="worker-identity-row"><span>User ID</span><strong>{connectionState === 'verified' ? identity.userId : '-'}</strong><span>API Key Label</span><strong>{connectionState === 'verified' ? identity.label : '-'}</strong></div>
      </section>

      <section className="worker-section worker-profiles-section">
        <div className="worker-section-heading"><div><h3>Terminal Workers</h3><p>Each worker owns one terminal, one identity and one workspace.</p></div></div>
        <div className="worker-table-wrap">
          <table className="worker-table">
            <thead><tr><th>Worker Name</th><th>Status</th><th>Activity</th><th>Current Job</th><th>Claimed</th><th>Auto Start</th><th>Actions</th></tr></thead>
            <tbody>
              {profiles.length === 0 ? <tr><td colSpan={7} className="worker-empty-row">No terminal workers configured.</td></tr> : profiles.map((profile) => (
                <tr key={profile.id} className={profile.id === selectedProfile?.id ? 'selected' : ''} onClick={() => setSelectedProfileId(profile.id)}>
                  <td><strong>{profile.workerName}</strong><small>{profile.id}</small></td>
                  <td><span className={`worker-state ${profile.status}`}>{profile.status}</span></td>
                  <td><span className={`worker-activity ${profile.activity}`}>{profile.activity}</span></td>
                  <td className="worker-job-cell">{profile.currentJob || '-'}</td>
                  <td>{profile.jobsClaimed}</td>
                  <td><label className="worker-switch" title="Auto start"><input type="checkbox" checked={profile.autoStart} disabled={busy || profile.status !== 'offline'} onChange={(event) => updateProfile(profile.id, { autoStart: event.target.checked })} /><span /></label></td>
                  <td><div className="worker-row-actions"><button title={profile.status === 'online' ? 'Stop worker' : 'Start worker'} disabled={busy || profile.status === 'starting' || profile.status === 'stopping'} className={profile.status === 'online' ? 'stop' : 'start'} onClick={(event) => { event.stopPropagation(); setWorkerRunning(profile, profile.status !== 'online'); }}>{profile.status === 'online' ? 'Stop' : 'Start'}</button>{profile.status === 'online' && <button title="Save changes and restart worker" disabled={busy} onClick={(event) => { event.stopPropagation(); restartProfile(profile); }}>Restart</button>}<button title="Delete worker" disabled={busy || profile.status !== 'offline'} className="delete" onClick={(event) => { event.stopPropagation(); deleteProfile(profile.id); }}>Delete</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedProfile && <section className="worker-section worker-profile-editor">
        <div className="worker-section-heading"><div><h3>Worker Configuration</h3><p>{selectedProfile.workerName}</p></div><span className="worker-profile-id">{selectedProfile.id}</span></div>
        <div className="worker-profile-grid">
          <label className="worker-field"><span>Worker Name</span><input value={selectedProfile.workerName} onChange={(event) => updateProfile(selectedProfile.id, { workerName: event.target.value })} /></label>
          <label className="worker-field worker-wide-field"><span>Terminal Executable</span><div className="worker-input-action"><input value={selectedProfile.terminalPath} disabled={selectedProfile.status !== 'offline'} onChange={(event) => updateProfile(selectedProfile.id, { terminalPath: event.target.value })} placeholder="C:\\Program Files\\MetaTrader 5\\terminal64.exe" /><button type="button" disabled={selectedProfile.status !== 'offline'} onClick={() => browseTerminal(selectedProfile)}>Browse</button></div></label>
          <label className="worker-field worker-wide-field"><span>Terminal Data Path</span><div className="worker-input-action"><input value={selectedProfile.dataPath} disabled={selectedProfile.status !== 'offline'} onChange={(event) => updateProfile(selectedProfile.id, { dataPath: event.target.value })} placeholder="C:\\Users\\...\\MetaQuotes\\Terminal\\..." /><button type="button" disabled={selectedProfile.status !== 'offline'} onClick={() => browseDirectory(selectedProfile, 'dataPath', 'Select Terminal Data Path')}>Browse</button></div></label>
          <label className="worker-field worker-wide-field"><span>Strategies Save Directory</span><div className="worker-input-action"><input value={selectedProfile.strategiesPath} disabled={selectedProfile.status !== 'offline'} onChange={(event) => updateProfile(selectedProfile.id, { strategiesPath: event.target.value })} placeholder="...\\MQL5\\Files\\Strategies" /><button type="button" disabled={selectedProfile.status !== 'offline'} onClick={() => browseDirectory(selectedProfile, 'strategiesPath', 'Select Strategies Save Directory')}>Browse</button></div></label>
          <label className="worker-field worker-wide-field"><span>Workspace Root</span><div className="worker-input-action"><input value={selectedProfile.workspacePath} disabled={selectedProfile.status !== 'offline'} onChange={(event) => updateProfile(selectedProfile.id, { workspacePath: event.target.value })} /><button type="button" disabled={selectedProfile.status !== 'offline'} onClick={() => browseDirectory(selectedProfile, 'workspacePath', 'Select Worker Workspace Root')}>Browse</button></div></label>
        </div>
        <div className="worker-editor-footer"><label className="worker-checkbox"><input type="checkbox" checked={selectedProfile.autoStart} disabled={selectedProfile.status !== 'offline'} onChange={(event) => updateProfile(selectedProfile.id, { autoStart: event.target.checked })} /> Start this worker when MT5 Utilities opens</label><button className="btn btn-primary" disabled={busy || selectedProfile.status !== 'offline'} onClick={() => void runAction(() => saveProfile(selectedProfile))}>Save Worker</button></div>
      </section>}

      <section className="worker-section worker-logs-section">
        <div className="worker-section-heading"><div><h3>Worker Logs</h3><p>Logs are isolated by worker.</p></div><div className="worker-log-actions"><select value={selectedProfileId} onChange={(event) => setSelectedProfileId(event.target.value)} disabled={profiles.length === 0}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.workerName}</option>)}</select><button onClick={scrollLogsToLatest} disabled={!selectedProfile || selectedLogCount === 0}>Latest</button><button onClick={copyLogs} disabled={!selectedProfile}>Copy</button><button onClick={() => selectedProfile && void runAction(async () => { await window.ipc.clearMt5WorkerLogs(selectedProfile.id); setLogs((current) => ({ ...current, [selectedProfile.id]: [] })); })} disabled={!selectedProfile}>Clear</button></div></div>
        <div ref={logConsoleRef} className="worker-log-console" onScroll={handleLogScroll}>{!selectedProfile ? <span>No worker selected.</span> : (logs[selectedProfile.id] ?? []).length === 0 ? <span>No log entries.</span> : (logs[selectedProfile.id] ?? []).map((line, index) => <div key={`${selectedProfile.id}-${index}`}>{line}</div>)}</div>
      </section>
    </div>
  );
};

const EAScannerTab = () => {
  const EA_SCANNER_DEFAULT_PATH = '/api/v1/expert-advisors/sync';

  const [serverUrl, setServerUrl] = useState(() => {
    try {
      return localStorage.getItem('eaScannerServerUrl') || 'http://127.0.0.1:8080';
    } catch {
      return 'http://127.0.0.1:8080';
    }
  });

  const [syncInterval, setSyncInterval] = useState(() => {
    try {
      return localStorage.getItem('eaScannerSyncInterval') || '300';
    } catch {
      return '300';
    }
  });

  const [restStart, setRestStart] = useState(() => {
    try {
      return localStorage.getItem('eaScannerRestStart') || '55';
    } catch {
      return '55';
    }
  });

  const [restEnd, setRestEnd] = useState(() => {
    try {
      return localStorage.getItem('eaScannerRestEnd') || '5';
    } catch {
      return '5';
    }
  });

  const [isSyncRunning, setIsSyncRunning] = useState(false);
  const [syncStatusMessage, setSyncStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [scanResult, setScanResult] = useState<EaScannerScanResult | null>(null);
  const [expandedTerminalIssues, setExpandedTerminalIssues] = useState<Record<string, boolean>>({});
  const [lastSyncMessage, setLastSyncMessage] = useState('');
  const [scannerPaths, setScannerPaths] = useState<string[]>([]);
  const [scannerTerminalCount, setScannerTerminalCount] = useState(0);
  const [scannerPathSelecting, setScannerPathSelecting] = useState(false);

  useEffect(() => {
    checkSyncStatus();
    window.ipc.getEaScannerPaths().then((result) => {
      setScannerPaths(result.paths);
      setScannerTerminalCount(result.terminalCount);
    }).catch(() => undefined);
    const interval = setInterval(checkSyncStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('eaScannerServerUrl', serverUrl);
      localStorage.setItem('eaScannerSyncInterval', syncInterval);
      localStorage.setItem('eaScannerRestStart', restStart);
      localStorage.setItem('eaScannerRestEnd', restEnd);
    } catch {
      // ignore
    }
  }, [serverUrl, syncInterval, restStart, restEnd]);

  const checkSyncStatus = async () => {
    try {
      const result = await window.ipc.getEaScannerSyncStatus();
      setIsSyncRunning(result.running);
      setSyncStatusMessage(result.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncStatusMessage(`Error: ${msg}`);
    }
  };

  const handleScan = async () => {
    setScanLoading(true);
    setScanResult(null);
    setExpandedTerminalIssues({});
    try {
      const result = await window.ipc.runEaScannerScan();
      if (result.success && result.data) {
        setScanResult(result.data);
      } else {
        alert(result.message || 'Scan failed');
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : err}`);
    } finally {
      setScanLoading(false);
    }
  };

  const handleSelectScannerPaths = async () => {
    if (scannerPathSelecting) return;
    setScannerPathSelecting(true);
    try {
      const result = await window.ipc.addEaScannerPath();
      if (result.success) {
        setScannerPaths(result.paths);
        setScannerTerminalCount(result.terminalCount);
      }
    } catch (err: unknown) {
      alert(`Error selecting folders: ${err instanceof Error ? err.message : err}`);
    } finally {
      setScannerPathSelecting(false);
    }
  };

  const handleClearScannerPaths = async () => {
    const result = await window.ipc.clearEaScannerPaths();
    setScannerPaths(result.paths);
    setScannerTerminalCount(result.terminalCount);
  };

  const handleRemoveScannerPath = async (scannerPath: string) => {
    const result = await window.ipc.removeEaScannerPath(scannerPath);
    setScannerPaths(result.paths);
    setScannerTerminalCount(result.terminalCount);
  };

  const scannerPathsLocked = scanLoading || syncLoading || isSyncRunning || loading || scannerPathSelecting;
  const helperBots = scanResult?.bots.filter((bot) => bot.bot_type === 'HELPER') || [];

  const handleSyncOnce = async () => {
    if (scannerPaths.length === 0) {
      alert('Select at least one MT5 folder before syncing');
      return;
    }
    if (!serverUrl.trim()) {
      alert('Server URL is required');
      return;
    }
    try {
      new URL(serverUrl);
    } catch {
      alert('Invalid server URL');
      return;
    }

    setSyncLoading(true);
    try {
      const result = await window.ipc.syncEaScannerBots(serverUrl);
      if (result.success) {
        setLastSyncMessage(result.message);
        if (result.data?.scan) {
          setScanResult(result.data.scan);
          setExpandedTerminalIssues({});
        }
      } else {
        alert(result.message);
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleStartSync = async () => {
    if (scannerPaths.length === 0) {
      alert('Select at least one MT5 folder before starting auto-sync');
      return;
    }
    const interval = parseInt(syncInterval, 10);
    if (isNaN(interval) || interval < 30) {
      alert('Sync interval must be at least 30 seconds');
      return;
    }
    const restStartNum = parseInt(restStart, 10);
    const restEndNum = parseInt(restEnd, 10);
    if (isNaN(restStartNum) || restStartNum < 0 || restStartNum > 59 || isNaN(restEndNum) || restEndNum < 0 || restEndNum > 59) {
      alert('Rest period values must be between 0 and 59');
      return;
    }
    if (!serverUrl.trim()) {
      alert('Server URL is required');
      return;
    }

    setLoading(true);
    try {
      const result = await window.ipc.startEaScannerSync(serverUrl, interval, restStartNum, restEndNum);
      if (result.success) {
        setIsSyncRunning(true);
        setSyncStatusMessage(result.message);
      } else {
        alert(result.message);
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLoading(false);
      await checkSyncStatus();
    }
  };

  const handleStopSync = async () => {
    setLoading(true);
    try {
      const result = await window.ipc.stopEaScannerSync();
      if (result.success) {
        setIsSyncRunning(false);
        setSyncStatusMessage(result.message);
      } else {
        alert(result.message);
      }
    } catch (err: unknown) {
      alert(`Error: ${err instanceof Error ? err.message : err}`);
    } finally {
      setLoading(false);
      await checkSyncStatus();
    }
  };

  const toggleTerminalIssues = (groupKey: string) => {
    setExpandedTerminalIssues((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  return (
    <div className="ea-scanner-tab">
      <div className="ea-scanner-header">
        <h2>🤖 EA Scanner</h2>
        <p className="ea-scanner-description">
          Select one or more MT5 terminal folders, compare target <code>.tpl</code> files with live chart bots
          (<code>.chr</code>), and sync the selected terminals to the server.
        </p>
      </div>

      <div className="ea-scanner-section">
        <h3>1. TPL vs CHR Check</h3>
        <p className="ea-scanner-hint">
          Detect missing bots on charts, invalid file naming, Buy/Sell misconfiguration, or timeframe issues.
        </p>
        <div className="ea-scanner-path-config">
          <div className="ea-scanner-path-actions">
            <button className="btn btn-secondary" onClick={handleSelectScannerPaths} disabled={scannerPathsLocked}>
              {scannerPathSelecting ? 'Selecting...' : '📁 Add MT5 folder'}
            </button>
            <button className="btn btn-warning" onClick={handleClearScannerPaths} disabled={scannerPathsLocked || scannerPaths.length === 0}>
              Clear saved paths
            </button>
            <div className="ea-scanner-terminal-count">
              Selected terminals: <strong>{scannerTerminalCount}</strong>
            </div>
          </div>
          {scannerPaths.length > 0 ? (
            <div className="ea-scanner-path-list">
              {scannerPaths.map((scannerPath) => (
                <div key={scannerPath} className="ea-scanner-path-item">
                  <code>{scannerPath}</code>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleRemoveScannerPath(scannerPath)}
                    disabled={scannerPathsLocked}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="ea-scanner-field-hint">No folders selected: select at least one MT5 folder before scanning.</div>
          )}
          <div className="ea-scanner-field-hint">
            Select one folder at a time and click this button again to add more folders. A selected parent folder can contain multiple MT5 terminals.
          </div>
          <div className="ea-scanner-field-hint">
            Folders on another Windows user or a network/UNC share work when this app account has read permission.
          </div>
        </div>
        <div className="ea-scanner-actions">
          <button className="btn btn-primary" onClick={handleScan} disabled={scanLoading || loading || scannerPaths.length === 0}>
            {scanLoading ? '⌛ Scanning...' : '🔍 Scan Now'}
          </button>
        </div>

          {scanResult && (
            <div className="ea-scanner-report">
              <div className="ea-scanner-summary">
                <span><strong>PC:</strong> {scanResult.pc_name}</span>
                <span><strong>Machine ID:</strong> {scanResult.machine_id}</span>
                <span><strong>Terminals:</strong> {scanResult.active_terminal_count}</span>
                <span><strong>TPL:</strong> {scanResult.summary.total_tpl}</span>
                <span><strong>Online bots:</strong> {scanResult.summary.total_active}</span>
              <span className={scanResult.summary.total_missing > 0 ? 'ea-error' : 'ea-ok'}>
                <strong>Missing:</strong> {scanResult.summary.total_missing}
              </span>
              <span className={scanResult.summary.total_errors > 0 ? 'ea-error' : 'ea-ok'}>
                <strong>Config errors:</strong> {scanResult.summary.total_errors}
              </span>
            </div>

            {scanResult.message && (
              <div className="ea-scanner-alert">{scanResult.message}</div>
            )}

            {scanResult.terminals.length === 0 && !scanResult.message && (
              <div className="ea-scanner-alert">No running MT5 terminals were detected.</div>
            )}

            {scanResult.terminals.map((term) => {
              const isIssuesExpanded = !!expandedTerminalIssues[term.group_key];
              const issueCount =
                term.chart_config_errors.length +
                term.missing_tpl_files.length +
                term.wrong_pattern_files.length +
                term.extra_chr_bots.length;

              return (
                <div key={term.group_key} className={`ea-terminal-card ${term.status === 'ok' ? 'ok' : 'error'}`}>
                  <div className="ea-terminal-title">
                    <span className={`status-badge ${term.status === 'ok' ? 'running' : 'stopped'}`}>
                      {term.status === 'ok' ? '✓ OK' : '✗ Error'}
                    </span>
                    <strong>{term.group_key}</strong>
                  </div>
                  <div className="ea-terminal-meta">
                    <div className="ea-terminal-stats">
                      Target TPL: {term.tpl_count} | Online bots: {term.active_count}
                      {term.live_snapshot && (
                        <> | AutoTrading: {term.algotrading ? 'ON' : 'OFF'}</>
                      )}
                    </div>
                    <button
                      type="button"
                      className="ea-terminal-toggle"
                      onClick={() => toggleTerminalIssues(term.group_key)}
                      aria-expanded={isIssuesExpanded}
                    >
                      {isIssuesExpanded ? 'Collapse' : `View details (${issueCount})`}
                    </button>
                  </div>

                  {isIssuesExpanded && (
                    <div className="ea-terminal-issues">
                      {term.chart_config_errors.length > 0 && (
                        <div className="ea-issue-block">
                          <div className="ea-issue-title">🚨 Chart config issues:</div>
                          <ul>{term.chart_config_errors.map((e) => <li key={e}>{e}</li>)}</ul>
                        </div>
                      )}

                      {term.missing_tpl_files.length > 0 && (
                        <div className="ea-issue-block">
                          <div className="ea-issue-title">⚠️ Missing TPL files on chart ({term.missing_tpl_files.length}):</div>
                          <ul>{term.missing_tpl_files.map((f) => <li key={f}>{f}</li>)}</ul>
                        </div>
                      )}

                      {term.wrong_pattern_files.length > 0 && (
                        <div className="ea-issue-block">
                          <div className="ea-issue-title">⚙️ Files with invalid naming pattern ({term.wrong_pattern_files.length}):</div>
                          <ul>{term.wrong_pattern_files.map((f) => <li key={f}>{f}</li>)}</ul>
                        </div>
                      )}

                      {term.extra_chr_bots.length > 0 && (
                        <div className="ea-issue-block">
                          <div className="ea-issue-title">ℹ️ Chart bots not matched to TPL ({term.extra_chr_bots.length}):</div>
                          <ul>{term.extra_chr_bots.map((b) => <li key={b}>{b}</li>)}</ul>
                        </div>
                      )}

                      {issueCount === 0 && (
                        <div className="ea-issue-empty">No detailed issues for this terminal.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {helperBots.length > 0 && (
              <div className="ea-helper-bots-panel">
                <div className="ea-helper-bots-title">Helper bots detected ({helperBots.length})</div>
                <div className="ea-helper-bots-hint">Helper bots are listed for visibility and are excluded from TPL comparison.</div>
                <div className="ea-helper-bots-list">
                  {helperBots.map((bot) => (
                    <div key={bot.identity_key} className="ea-helper-bot-item">
                      <strong>{bot.name || bot.bot_id}</strong>
                      <span>{bot.user} → {bot.cluster} → {bot.terminal}</span>
                      <span>Account: {bot.account} | Server: {bot.server}</span>
                      {bot.expert_path && <code>{bot.expert_path}</code>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scanResult && (
              <details className="ea-bots-details">
                <summary>📦 Sync payload preview ({scanResult.bots.length} detected bots)</summary>
                <pre className="ea-scanner-code">{JSON.stringify(buildEaScannerSyncPayload(scanResult), null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="ea-scanner-section">
        <h3>2. Sync Bots to API</h3>
        <p className="ea-scanner-hint">
          Send all detected bots to server
          {/* <code>{EA_SCANNER_DEFAULT_PATH}</code>. Use the shared <code>SYSTEM_MONITOR_API_KEY</code> in `.env`. */}
        </p>

        <div className="ea-scanner-status-card">
          <div className="ea-scanner-status-row">
            <span className="ea-scanner-status-label">Auto-sync:</span>
            <span className={`status-badge ${isSyncRunning ? 'running' : 'stopped'}`}>
              {isSyncRunning ? '✓ Running' : '⊘ Stopped'}
            </span>
          </div>
          <div className="ea-scanner-status-message">{syncStatusMessage}</div>
          {lastSyncMessage && <div className="ea-scanner-status-message">{lastSyncMessage}</div>}
        </div>

        <div className="ea-scanner-config">
          <div className="ea-scanner-field">
            <label htmlFor="eaServerUrl">Server URL:</label>
            <input
              id="eaServerUrl"
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={isSyncRunning || loading}
              placeholder="http://127.0.0.1:8080"
              className="ea-scanner-input"
            />
            <span className="ea-scanner-field-hint">
              Enter the base server URL. The app will POST to <code>{EA_SCANNER_DEFAULT_PATH}</code>.
            </span>
          </div>

          <div className="ea-scanner-field">
            <label htmlFor="eaSyncInterval">Auto-sync interval (seconds):</label>
            <input
              id="eaSyncInterval"
              type="number"
              min="30"
              max="86400"
              value={syncInterval}
              onChange={(e) => setSyncInterval(e.target.value)}
              disabled={isSyncRunning || loading}
              className="monitor-input-small"
            />
            <span className="monitor-hint">How often to scan and send bot data (30-86400 seconds).</span>
          </div>

          <div className="ea-scanner-field">
            <label>Rest period (minutes per hour):</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="eaScannerRestStart" style={{ fontSize: '12px', color: '#666' }}>Start (0-59):</label>
                <input
                  id="eaScannerRestStart"
                  type="number"
                  min="0"
                  max="59"
                  value={restStart}
                  onChange={(e) => setRestStart(e.target.value)}
                  disabled={isSyncRunning || loading}
                  className="monitor-input-small"
                  style={{ width: '80px' }}
                />
              </div>
              <span style={{ marginTop: '20px' }}>-&gt;</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label htmlFor="eaScannerRestEnd" style={{ fontSize: '12px', color: '#666' }}>End (0-59):</label>
                <input
                  id="eaScannerRestEnd"
                  type="number"
                  min="0"
                  max="59"
                  value={restEnd}
                  onChange={(e) => setRestEnd(e.target.value)}
                  disabled={isSyncRunning || loading}
                  className="monitor-input-small"
                  style={{ width: '80px' }}
                />
              </div>
            </div>
            <span className="monitor-hint">
              Auto-sync skips scanning and posting during this local-time window. Sync Once is always manual.
            </span>
          </div>
        </div>

        <div className="ea-scanner-actions">
          <button className="btn btn-success" onClick={handleSyncOnce} disabled={syncLoading || loading || isSyncRunning || scannerPaths.length === 0}>
            {syncLoading ? '⌛ Syncing...' : '⬆ Sync Once'}
          </button>
          {!isSyncRunning ? (
            <button className="btn btn-primary" onClick={handleStartSync} disabled={loading || syncLoading || scannerPaths.length === 0}>
              Start Auto-sync
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleStopSync} disabled={loading}>
              Stop Auto-sync
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const emptyHistoryAccount = (): Mt5HistoryAccountConfig => ({
  name: '', terminal_path: '', login: '', server: '', password: '', api_key: '',
  monitor_id: '', symbol: '', start_date: '2020-01-01T00:00:00+00:00',
  server_url: '', interval_seconds: 30, history_url: '', closed_positions_url: '',
});

const HistorySyncTab = () => {
  const [config, setConfig] = useState<Mt5HistorySyncConfig>({ interval_seconds: 30, state_dir: '', accounts: [] });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const result = await window.ipc.getMt5HistoryConfig();
    if (result.success) setConfig(result.data);
    const status = await window.ipc.getMt5HistorySyncStatus();
    setRunning(status.running);
  };

  useEffect(() => { void load(); }, []);

  const updateAccount = (index: number, patch: Partial<Mt5HistoryAccountConfig>) => {
    setConfig((current) => ({
      ...current,
      accounts: current.accounts.map((account, accountIndex) => accountIndex === index ? { ...account, ...patch } : account),
    }));
  };

  const save = async () => {
    setBusy(true);
    const result = await window.ipc.saveMt5HistoryConfig(config);
    setMessage(result.message);
    if (result.success && result.data) setConfig(result.data);
    setBusy(false);
  };

  const start = async () => {
    setBusy(true);
    const saved = await window.ipc.saveMt5HistoryConfig(config);
    if (!saved.success) { setMessage(saved.message); setBusy(false); return; }
    const result = await window.ipc.startMt5HistorySync();
    setRunning(result.running);
    setMessage(result.message);
    setBusy(false);
  };

  const uploadFromBeginning = async () => {
    if (!window.confirm('Xóa cursor lịch sử và upload lại toàn bộ từ Start date?')) return;
    setBusy(true);
    const saved = await window.ipc.saveMt5HistoryConfig(config);
    if (!saved.success) { setMessage(saved.message); setBusy(false); return; }
    const reset = await window.ipc.resetMt5HistoryState();
    if (!reset.success) { setMessage(reset.message); setBusy(false); return; }
    const result = await window.ipc.startMt5HistorySync();
    setRunning(result.running);
    setMessage(`${reset.message} ${result.message}`);
    setBusy(false);
  };

  const stop = async () => {
    setBusy(true);
    const result = await window.ipc.stopMt5HistorySync();
    setRunning(result.running);
    setMessage(result.message);
    setBusy(false);
  };

  return (
    <div className="ea-scanner-tab">
      <div className="ea-scanner-header history-sync-header">
        <div>
          <h2>📚 MT5 History API Sync</h2>
        </div>
        <div className="ea-scanner-status-row history-sync-header-status">
          <span className="ea-scanner-status-label">Status:</span>
          <span className={`status-badge ${running ? 'running' : 'stopped'}`}>{running ? 'Running' : 'Stopped'}</span>
        </div>
      </div>
      <div className="ea-scanner-section">
        <div className="ea-scanner-status-card">
          {message && <div className="ea-scanner-status-message">{message}</div>}
        </div>
        {config.accounts.map((account, index) => (
          <div className="ea-scanner-config history-account-card" key={`${index}-${account.name}`}>
            <div className="history-account-title">
              <h3>Account {index + 1}</h3>
              <button className="history-delete-button" title="Xóa tài khoản" aria-label="Xóa tài khoản" onClick={() => setConfig({ ...config, accounts: config.accounts.filter((_, accountIndex) => accountIndex !== index) })}>🗑️</button>
            </div>
            <div className="history-account-grid">
              <div className="watcher-upload-field"><label>Login</label><input className="ea-scanner-input" type="number" value={String(account.login ?? '')} onChange={(e) => updateAccount(index, { login: e.target.value })} /></div>
              <div className="watcher-upload-field"><label>Password</label><input className="ea-scanner-input" type="password" value={String(account.password ?? '')} onChange={(e) => updateAccount(index, { password: e.target.value })} /></div>

              <div className="watcher-upload-field"><label>Server</label><input className="ea-scanner-input" value={String(account.server ?? '')} onChange={(e) => updateAccount(index, { server: e.target.value })} /></div>
              <div className="watcher-upload-field history-terminal-field"><label>Terminal Path</label><div className="history-input-with-button"><input className="ea-scanner-input" value={String(account.terminal_path ?? '')} onChange={(e) => updateAccount(index, { terminal_path: e.target.value })} /><button className="btn btn-secondary" onClick={async () => { const selected = await window.ipc.selectMt5WorkerTerminal(); if (selected) updateAccount(index, { terminal_path: selected }); }}>Browse</button></div></div>

              <div className="watcher-upload-field"><label>API Key</label><input className="ea-scanner-input" type="password" value={String(account.api_key ?? '')} onChange={(e) => updateAccount(index, { api_key: e.target.value })} /></div>
              <div className="watcher-upload-field"><label>Symbol</label><input className="ea-scanner-input" placeholder="Empty = all" value={String(account.symbol ?? '')} onChange={(e) => updateAccount(index, { symbol: e.target.value })} /></div>

              <div className="watcher-upload-field"><label>Start Date</label><input className="ea-scanner-input" type="date" value={String(account.start_date ?? '2020-01-01').slice(0, 10)} onChange={(e) => updateAccount(index, { start_date: `${e.target.value}T00:00:00+00:00` })} /></div>
              <div className="watcher-upload-field"><label>Interval (s)</label><input className="ea-scanner-input" type="number" min="5" value={String(account.interval_seconds ?? config.interval_seconds)} onChange={(e) => { const value = Number(e.target.value) || 30; updateAccount(index, { interval_seconds: value }); setConfig((current) => ({ ...current, interval_seconds: value })); }} /></div>

              <div className="watcher-upload-field history-full-field"><label>Server URL</label><input className="ea-scanner-input" placeholder="http://127.0.0.1:8080" value={String(account.server_url ?? '')} onChange={(e) => updateAccount(index, { server_url: e.target.value })} /></div>
            </div>
          </div>
        ))}
        <div className="ea-scanner-actions history-bottom-bar">
          <button className="btn btn-secondary" onClick={() => setConfig({ ...config, accounts: [...config.accounts, emptyHistoryAccount()] })}>+ Add account</button>
          <div className="history-bottom-right">
            <button className="btn btn-warning" onClick={uploadFromBeginning} disabled={busy || config.accounts.length === 0}>Resync & Upload All</button>
            {running && <button className="btn btn-danger" onClick={stop} disabled={busy}>Stop PM2</button>}
            {!running && <button className="btn btn-success" onClick={start} disabled={busy || config.accounts.length === 0}>Start PM2</button>}
            <button className="btn btn-primary" onClick={save} disabled={busy}>Save settings</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const App = () => {
  const [currentTab, setCurrentTab] = useState<'watcher' | 'backup' | 'mt5config' | 'optimization' | 'monitor' | 'ea-scanner' | 'history-sync'>('watcher');
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [backupTasks, setBackupTasks] = useState<BackupTask[]>([]);
  const [mt5AutoRunCount, setMt5AutoRunCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pm2Available, setPM2Available] = useState<boolean | null>(null);
  const [backupInterval, setBackupInterval] = useState('3600');
  const [watcherUploadEnabled, setWatcherUploadEnabled] = useState(() => {
    try {
      return localStorage.getItem('watcherUploadEnabled') === '1';
    } catch {
      return false;
    }
  });
  const [watcherServerUrl, setWatcherServerUrl] = useState(() => {
    try {
      return localStorage.getItem('watcherServerUrl') || 'http://127.0.0.1:8080';
    } catch {
      return 'http://127.0.0.1:8080';
    }
  });
  const [watcherUploadMessage, setWatcherUploadMessage] = useState('Upload is disabled.');
  const [watcherUploadSaving, setWatcherUploadSaving] = useState(false);

  useEffect(() => {
    checkPM2Availability(true);
    loadSavedTerminals();
    loadSavedBackups();
    void loadWatcherUploadConfig();
  }, []);

  const checkPM2Availability = async (showAlert = false) => {
    const available = await window.ipc.checkPM2Available();
    setPM2Available(available);
    if (!available && showAlert) alert('PM2 is not installed globally.\nInstall it with: npm install -g pm2');
    return available;
  };

  const loadSavedTerminals = () => {
    const saved = localStorage.getItem('terminals');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Terminal[];
        setTerminals(parsed);
        void syncWatcherStatuses(parsed);
      } catch { /* ignore */ }
    }
  };

  const loadSavedBackups = () => {
    const saved = localStorage.getItem('backupTasks');
    if (saved) {
      try { setBackupTasks(JSON.parse(saved)); } catch { /* ignore */ }
    }
  };

  const loadWatcherUploadConfig = async () => {
    try {
      const result = await window.ipc.getWatcherUploadConfig();
      if (result.success && result.data) {
        setWatcherUploadEnabled(result.data.enabled);
        setWatcherServerUrl(result.data.serverUrl || 'http://127.0.0.1:8080');
        setWatcherUploadMessage(
          result.data.enabled && result.data.serverUrl
            ? `Uploading to ${result.data.serverUrl}`
            : 'Upload is disabled.',
        );
      }
    } catch {
      // ignore
    }
  };

  const saveTerminals = (newTerminals: Terminal[]) => {
    localStorage.setItem('terminals', JSON.stringify(newTerminals));
    setTerminals(newTerminals);
  };

  const saveBackups = (newBackups: BackupTask[]) => {
    localStorage.setItem('backupTasks', JSON.stringify(newBackups));
    setBackupTasks(newBackups);
  };

  useEffect(() => {
    try {
      localStorage.setItem('watcherUploadEnabled', watcherUploadEnabled ? '1' : '0');
      localStorage.setItem('watcherServerUrl', watcherServerUrl);
    } catch {
      // ignore
    }
  }, [watcherUploadEnabled, watcherServerUrl]);

  const handleSaveWatcherUploadConfig = async () => {
    console.log('[watcher-upload] save clicked', {
      enabled: watcherUploadEnabled,
      serverUrl: watcherServerUrl,
    });
    setWatcherUploadMessage('Saving upload settings...');

    if (watcherUploadEnabled) {
      if (!watcherServerUrl.trim()) {
        setWatcherUploadMessage('Server URL is required.');
        alert('Server URL is required');
        return;
      }
      try {
        new URL(watcherServerUrl);
      } catch {
        setWatcherUploadMessage('Server URL is invalid.');
        alert('Invalid server URL');
        return;
      }
    }

    setWatcherUploadSaving(true);
    try {
      const result = await window.ipc.setWatcherUploadConfig({
        enabled: watcherUploadEnabled,
        serverUrl: watcherServerUrl,
      });
      console.log('[watcher-upload] save result', result);
      if (result.success) {
        setWatcherUploadMessage(
          result.data?.enabled && result.data?.serverUrl
            ? `Saved. Uploading to ${result.data.serverUrl}`
            : 'Saved. Upload is disabled.',
        );
      } else {
        setWatcherUploadMessage(result.message || 'Failed to save upload settings.');
        alert(result.message);
      }
    } catch (err: unknown) {
      setWatcherUploadMessage(`Save failed: ${err instanceof Error ? err.message : err}`);
      alert(`Error: ${err instanceof Error ? err.message : err}`);
    } finally {
      setWatcherUploadSaving(false);
    }
  };

  const handleResyncWatcherUploadState = async () => {
    setWatcherUploadSaving(true);
    setWatcherUploadMessage('Resyncing old logs...');
    try {
      const result = await window.ipc.resyncWatcherUploadState();
      console.log('[watcher-upload] resync result', result);
      setWatcherUploadMessage(result.success ? (result.message || 'Resync complete.') : (result.message || 'Resync failed.'));
    } catch (err: unknown) {
      setWatcherUploadMessage(`Resync failed: ${err instanceof Error ? err.message : err}`);
      alert(`Resync failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setWatcherUploadSaving(false);
    }
  };

  const getTerminalStatusLabel = (status: Terminal['status']) => {
    if (status === 'checking') return 'Checking...';
    if (status === 'running') return 'Running';
    if (status === 'missing') return 'Missing';
    return 'Stopped';
  };

  const getTerminalWatchedLabel = (watched?: boolean) => (watched ? 'Watched' : 'Not watched');

  const getBackupStatusLabel = (status: BackupTask['status']) => {
    if (status === 'checking') return 'Checking...';
    if (status === 'running') return 'Running';
    if (status === 'missing') return 'Missing';
    return 'Stopped';
  };

  const syncWatcherStatuses = async (terminalList = terminals) => {
    try {
      const config = await window.ipc.getWatcherGroupConfig();
      const watchedPaths = new Set(
        (config.slots || [])
          .filter((slot) => slot.enabled !== false)
          .map((slot) => normalizeWindowsPath(slot.path)),
      );
      const nextTerminals = terminalList.map((terminal) => ({
        ...terminal,
        watched: watchedPaths.has(normalizeWindowsPath(terminal.path)),
      }));
      saveTerminals(nextTerminals);
      return nextTerminals;
    } catch (error) {
      console.warn('[watcher-config] failed to load watched terminals:', error);
      return terminalList;
    }
  };

  const syncTerminalStatuses = async () => {
    const results = await Promise.all(
      terminals.map(async (terminal) => {
        try {
          const result = await window.ipc.getProcessLifecycleStatus(terminal.path);
          return { path: terminal.path, status: result.status };
        } catch {
          return { path: terminal.path, status: 'missing' as const };
        }
      })
    );

    const nextTerminals = terminals.map((terminal) => {
      const matched = results.find((item) => item.path === terminal.path);
      return matched ? { ...terminal, status: matched.status } : terminal;
    });
    saveTerminals(nextTerminals);
    return nextTerminals;
  };

  const syncBackupStatuses = async () => {
    const results = await Promise.all(
      backupTasks.map(async (task) => {
        try {
          const result = await window.ipc.getBackupLifecycleStatus(task.sourcePath, task.destPath, task.intervalSeconds);
          return { id: task.id, status: result.status };
        } catch {
          return { id: task.id, status: 'missing' as const };
        }
      })
    );

    saveBackups(backupTasks.map((task) => {
      const matched = results.find((item) => item.id === task.id);
      return matched ? { ...task, status: matched.status } : task;
    }));
  };

  const handleResetStatuses = async () => {
    setLoading(true);
    try {
      const nextTerminals = await syncTerminalStatuses();
      await syncWatcherStatuses(nextTerminals);
      await syncBackupStatuses();
    } finally {
      setLoading(false);
    }
  };

  const handleAddTerminal = async () => {
    const path = await window.ipc.selectTerminalFolder();
    if (path) {
      const hash = path.split('\\').pop() || 'unknown';
      const newTerminal: Terminal = { path, hash, status: 'running', watched: false };
      const updatedTerminals = [...terminals];
      const existingIndex = updatedTerminals.findIndex((t) => t.path === path);
      if (existingIndex >= 0) updatedTerminals[existingIndex] = newTerminal;
      else updatedTerminals.push(newTerminal);
      saveTerminals(updatedTerminals);
      const watchedTerminals = await syncWatcherStatuses(updatedTerminals);

      try {
        const result = await window.ipc.startProcess(path);
        if (!result.success) {
          alert(result.message);
          saveTerminals(watchedTerminals.map((t) => t.path === path ? { ...t, status: 'stopped' } : t));
        } else {
          saveTerminals(watchedTerminals.map((t) => t.path === path ? { ...t, status: 'running' } : t));
        }
      } catch (error) {
        alert(`Error: ${error}`);
        saveTerminals(watchedTerminals.map((t) => t.path === path ? { ...t, status: 'stopped' } : t));
      }
    }
  };

  const handleStartAllTerminals = async () => {
    if (terminals.length === 0) return;
    setLoading(true);
    const checkingTerminals: Terminal[] = terminals.map((t) => ({ ...t, status: 'checking' }));
    setTerminals(checkingTerminals);
    try {
      for (const terminal of terminals) {
        await window.ipc.startProcess(terminal.path);
      }
      const runningTerminals = await syncWatcherStatuses(checkingTerminals.map((t) => ({ ...t, status: 'running' })));
      saveTerminals(runningTerminals);
    } catch (error) {
      alert(`Error: ${error}`);
      await syncTerminalStatuses();
    } finally {
      setLoading(false);
    }
  };

  const handleStopAllTerminals = async () => {
    if (terminals.length === 0) return;
    setLoading(true);
    const checkingTerminals: Terminal[] = terminals.map((t) => ({ ...t, status: 'checking' }));
    setTerminals(checkingTerminals);
    try {
      for (const terminal of terminals) {
        await window.ipc.stopProcess(terminal.path);
      }
      const stoppedTerminals = await syncWatcherStatuses(checkingTerminals.map((t) => ({ ...t, status: 'stopped' })));
      saveTerminals(stoppedTerminals);
    } catch (error) {
      alert(`Error: ${error}`);
      await syncTerminalStatuses();
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAllTerminals = async () => {
    if (terminals.length === 0) return;
    setLoading(true);
    try {
      for (const terminal of terminals) {
        try {
          await window.ipc.stopProcess(terminal.path);
        } catch {
          // ignore
        }
      }
      saveTerminals([]);
      await syncWatcherStatuses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTerminal = async (terminalPath: string) => {
    setLoading(true);
    try {
      try {
        await window.ipc.stopProcess(terminalPath);
      } catch {
        // ignore
      }
      const nextTerminals = terminals.filter((t) => t.path !== terminalPath);
      const watchedTerminals = await syncWatcherStatuses(nextTerminals);
      saveTerminals(watchedTerminals);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBackup = async () => {
    const sourcePath = await window.ipc.selectSourceFolder();
    if (!sourcePath) return;
    const destPath = await window.ipc.selectDestinationFolder();
    if (!destPath) return;
    const intervalSec = parseInt(backupInterval, 10);
    if (isNaN(intervalSec) || intervalSec < 1) {
      alert('Please enter a valid interval in seconds');
      return;
    }
    const id = `${sourcePath}-${Date.now()}`;
    const newBackup: BackupTask = { sourcePath, destPath, intervalSeconds: intervalSec, status: 'running', id };
    const updatedBackups = [...backupTasks];
    updatedBackups.push(newBackup);
    saveBackups(updatedBackups);

    try {
      const result = await window.ipc.startBackup(sourcePath, destPath, intervalSec);
      if (!result.success) {
        alert(result.message);
        saveBackups(updatedBackups.map((t) => t.id === id ? { ...t, status: 'stopped' } : t));
      } else {
        saveBackups(updatedBackups.map((t) => t.id === id ? { ...t, status: 'running' } : t));
      }
    } catch (error) {
      alert(`Error: ${error}`);
      saveBackups(updatedBackups.map((t) => t.id === id ? { ...t, status: 'stopped' } : t));
    }
  };

  const handleStartAllBackups = async () => {
    if (backupTasks.length === 0) return;
    setLoading(true);
    setBackupTasks(backupTasks.map((t) => ({ ...t, status: 'checking' })));
    try {
      for (const task of backupTasks) {
        await window.ipc.startBackup(task.sourcePath, task.destPath, task.intervalSeconds);
      }
      saveBackups(backupTasks.map((t) => ({ ...t, status: 'running' })));
    } catch (error) {
      alert(`Error: ${error}`);
      await syncBackupStatuses();
    } finally {
      setLoading(false);
    }
  };

  const handleStopAllBackups = async () => {
    if (backupTasks.length === 0) return;
    setLoading(true);
    setBackupTasks(backupTasks.map((t) => ({ ...t, status: 'checking' })));
    try {
      for (const task of backupTasks) {
        await window.ipc.stopBackup(task.sourcePath, task.destPath, task.intervalSeconds);
      }
      saveBackups(backupTasks.map((t) => ({ ...t, status: 'stopped' })));
    } catch (error) {
      alert(`Error: ${error}`);
      await syncBackupStatuses();
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAllBackups = async () => {
    if (backupTasks.length === 0) return;
    setLoading(true);
    try {
      for (const task of backupTasks) {
        try {
          await window.ipc.stopBackup(task.sourcePath, task.destPath, task.intervalSeconds);
        } catch {
          // ignore
        }
      }
      saveBackups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveBackup = async (id: string) => {
    setLoading(true);
    try {
      const task = backupTasks.find((t) => t.id === id);
      if (task) {
        try {
          await window.ipc.stopBackup(task.sourcePath, task.destPath, task.intervalSeconds);
        } catch {
          // ignore
        }
      }
      saveBackups(backupTasks.filter((t) => t.id !== id));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>MT5 Utilities</h1>
        <p className="subtitle">A utility suite for MT5 terminal management, backups, optimization, monitoring, and EA scanning</p>
      </header>

      <div className="status-bar">
        <span className={`pm2-status ${pm2Available ? 'available' : 'unavailable'}`}>
          PM2: {pm2Available ? 'Available' : 'Not Installed'}
        </span>
        <div>
        </div>
        
      </div>

      <div className="tabs">
        <button className={`tab-button ${currentTab === 'watcher' ? 'active' : ''}`} onClick={() => setCurrentTab('watcher')}>
          📋 Log Watcher <span className="tab-count">{terminals.length}</span>
        </button>
        <button className={`tab-button ${currentTab === 'backup' ? 'active' : ''}`} onClick={() => setCurrentTab('backup')}>
          💾 Backup Folder <span className="tab-count">{backupTasks.length}</span>
        </button>
        <button className={`tab-button ${currentTab === 'mt5config' ? 'active' : ''}`} onClick={() => setCurrentTab('mt5config')}>
          📡 MT5 Auto Run <span className="tab-count">{mt5AutoRunCount}</span>
        </button>
        <button className={`tab-button ${currentTab === 'optimization' ? 'active' : ''}`} onClick={() => setCurrentTab('optimization')}>🔬 MT5 Workers</button>
        <button className={`tab-button ${currentTab === 'monitor' ? 'active' : ''}`} onClick={() => setCurrentTab('monitor')}>🖥️ System Monitor</button>
        <button className={`tab-button ${currentTab === 'ea-scanner' ? 'active' : ''}`} onClick={() => setCurrentTab('ea-scanner')}>🤖 EA Scanner</button>
        <button className={`tab-button ${currentTab === 'history-sync' ? 'active' : ''}`} onClick={() => setCurrentTab('history-sync')}>📚 History Sync</button>
      </div>

      <div style={{ display: currentTab === 'watcher' ? 'block' : 'none' }}>
        <div className="controls watcher-controls">
          <button className="btn btn-primary" onClick={handleAddTerminal} disabled={loading || pm2Available === false}>+ Add MT5 Terminal</button>
          <button className="btn btn-success" onClick={handleStartAllTerminals} disabled={loading || pm2Available === false || terminals.length === 0}>Run All</button>
          <button className="btn btn-danger" onClick={handleStopAllTerminals} disabled={loading || terminals.length === 0}>Stop All</button>
          <button className="btn btn-warning" onClick={handleRemoveAllTerminals} disabled={loading || terminals.length === 0}>Clear All</button>
          <button className="btn btn-secondary" onClick={handleResetStatuses} disabled={loading || pm2Available === false}>Reset Status</button>
        </div>

        <div className="watcher-upload-card">
          <div className="watcher-upload-header">
            <h3>Server Log Upload</h3>
            <span className={`status-badge ${watcherUploadEnabled ? 'running' : 'stopped'}`}>
              {watcherUploadEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="watcher-upload-hint">
            Watch Journal logs from <code>Logs</code> and Expert logs from <code>MQL5\Logs</code> directly.
            New log lines are sent to the server DB as they appear.
          </p>
          <div className="watcher-upload-grid">
            <label className="watcher-upload-toggle">
              <input
                type="checkbox"
                checked={watcherUploadEnabled}
                onChange={(e) => setWatcherUploadEnabled(e.target.checked)}
                disabled={loading || watcherUploadSaving}
              />
              Enable server upload
            </label>
            <div className="watcher-upload-field">
              <label htmlFor="watcherServerUrl">Server URL</label>
              <input
                id="watcherServerUrl"
                type="text"
                value={watcherServerUrl}
                onChange={(e) => setWatcherServerUrl(e.target.value)}
                disabled={loading || watcherUploadSaving || !watcherUploadEnabled}
                placeholder="http://127.0.0.1:8080"
                className="ea-scanner-input"
              />
            </div>
          </div>
          <div className="watcher-upload-actions">
            <button
              className="btn btn-primary"
              onClick={handleSaveWatcherUploadConfig}
              disabled={loading || watcherUploadSaving}
            >
              {watcherUploadSaving ? 'Saving...' : 'Save Upload Settings'}
            </button>
            <button
              className="btn btn-warning"
              onClick={handleResyncWatcherUploadState}
              disabled={loading || watcherUploadSaving}
            >
              Resync & Upload All
            </button>
            <div className="watcher-upload-message">{watcherUploadMessage}</div>
          </div>
        </div>

        <div className="terminals-list">
          {terminals.length === 0 ? (
            <div className="empty-state"><p>No terminals added yet. Click "Add MT5 Terminal" to get started.</p></div>
          ) : (
            terminals.map((terminal) => (
              <div key={terminal.path} className="terminal-card">
                <div className="terminal-info">
                  <div className="terminal-path" title={terminal.path}>{terminal.path}</div>
                  <div className="terminal-hash">Folder: {terminal.hash}</div>
                </div>
                <div className="terminal-status">
                  <span className={`status-badge ${terminal.status}`}>
                    {terminal.status === 'checking' ? 'Checking...' : ''}
                    {terminal.status === 'running' ? 'Running' : ''}
                    {terminal.status === 'missing' ? 'Missing' : ''}
                    {terminal.status === 'stopped' ? 'Stopped' : ''}
                  </span>
                  <span className={`status-badge ${terminal.watched ? 'watched' : 'unwatched'}`}>
                    {getTerminalWatchedLabel(terminal.watched)}
                  </span>
                </div>
                <div className="terminal-actions">
                  <button className="btn btn-secondary" onClick={() => handleRemoveTerminal(terminal.path)} disabled={loading}>Clear</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ display: currentTab === 'backup' ? 'block' : 'none' }}>
        <div className="backup-section">
          <div className="controls backup-controls">
            <div className="backup-input-group">
              <label htmlFor="interval">Backup Interval (seconds):</label>
              <input id="interval" type="number" min="60" step="60" value={backupInterval} onChange={(e) => setBackupInterval(e.target.value)} placeholder="3600" disabled={loading} />
              <span className="interval-hint">Min: 60 seconds (default: 3600 = 1 hour)</span>
            </div>
            <button className="btn btn-primary" onClick={handleAddBackup} disabled={loading || pm2Available === false}>+ Add Backup Task</button>
            <button className="btn btn-success" onClick={handleStartAllBackups} disabled={loading || pm2Available === false || backupTasks.length === 0}>Run All</button>
            <button className="btn btn-danger" onClick={handleStopAllBackups} disabled={loading || backupTasks.length === 0}>Stop All</button>
            <button className="btn btn-secondary" onClick={handleRemoveAllBackups} disabled={loading || backupTasks.length === 0}>Clear All</button>
            <button className="btn btn-secondary" onClick={handleResetStatuses} disabled={loading || pm2Available === false}>Reset Status</button>
          </div>
          <div className="backups-list">
            {backupTasks.length === 0 ? (
              <div className="empty-state"><p>No backup tasks added yet. Click "Add Backup Task" to get started.</p></div>
            ) : (
              backupTasks.map((task) => (
                <div key={task.id} className="backup-card">
                  <div className="backup-info">
                    <div className="backup-source"><strong>Source:</strong> {task.sourcePath}</div>
                    <div className="backup-dest"><strong>Destination:</strong> {task.destPath}</div>
                    <div className="backup-interval"><strong>Interval:</strong> {task.intervalSeconds}s ({Math.round(task.intervalSeconds / 60)} min)</div>
                  </div>
                  <div className="backup-status">
                    <span className={`status-badge ${task.status}`}>
                      {task.status === 'checking' ? 'Checking...' : ''}
                      {task.status === 'running' ? 'Running' : ''}
                      {task.status === 'missing' ? 'Missing' : ''}
                      {task.status === 'stopped' ? 'Stopped' : ''}
                    </span>
                  </div>
                  <div className="backup-actions">
                    <button className="btn btn-secondary" onClick={() => handleRemoveBackup(task.id)} disabled={loading}>Clear</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={{ display: currentTab === 'mt5config' ? 'block' : 'none' }}>
        <Mt5PathConfigTab onCountChange={setMt5AutoRunCount} />
      </div>

      <div style={{ display: currentTab === 'optimization' ? 'block' : 'none' }}>
        <Mt5WorkersTab />
      </div>

      <div style={{ display: currentTab === 'monitor' ? 'block' : 'none' }}>
        <SystemMonitorTab />
      </div>

      <div style={{ display: currentTab === 'ea-scanner' ? 'block' : 'none' }}>
        <EAScannerTab />
      </div>

      <div style={{ display: currentTab === 'history-sync' ? 'block' : 'none' }}>
        <HistorySyncTab />
      </div>

      <footer className="footer">
        <p>Backend processes are managed by pm2 and continue running even after closing this application.</p>
      </footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);



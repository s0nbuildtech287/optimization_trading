/**
 * System Monitor Service  –  Node.js side
 *
 * Architecture:
 *   Python daemon (system_monitor.py)  ──JSON lines──►  this process  ──POST──►  server
 *
 * Why Python?
 *   The `systeminformation` npm package uses WMI on Windows for almost every
 *   metric.  WMI round-trips are expensive and regularly spike the CPU to
 *   40 %+ per collection cycle, especially under pm2.
 *
 *   Python's `psutil` library hits the Windows PDH / NTAPI directly – the
 *   same low-level counters that Task Manager reads – without spawning
 *   separate COM/WMI processes.  CPU overhead drops to ~1-2 %.
 *
 * Prerequisites on each monitored machine:
 *   pip install psutil
 *
 * Usage:
 *   node systemMonitor.js <server-url> <interval-seconds> [machine-id]
 *
 * Auth (agent → server):
 *   Header X-Agent-API-Key must match server SYSTEM_MONITOR_API_KEY (.env).
 *   Set SYSTEM_MONITOR_API_KEY in the project .env (PM2 cwd = project root).
 */

import { spawn, ChildProcessByStdio } from 'child_process';
import { Readable } from 'stream';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import {
    AGENT_API_KEY_HEADER,
    sendMonitorDisconnect,
    resolveMonitorIngestUrl,
    writeMonitorSession,
} from '../utils/systemMonitorApi';

/** Load .env from PM2 cwd or paths next to this script (dev / packaged). */
function loadMonitorEnv(): void {
    const candidates = [
        path.join(process.cwd(), '.env'),
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '../../.env'),
    ];
    for (const envPath of candidates) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            return;
        }
    }
    dotenv.config();
}

loadMonitorEnv();

// ── Types (kept compatible with the original API shape) ─────────────────────

interface SystemInfo {
    machineId: string;
    timestamp: number;
    hostname: string;
    platform: string;

    cpu: {
        manufacturer: string;
        brand: string;
        cores: number;
        physicalCores: number;
        speed: number;   // GHz
        currentLoad: number;   // %
        temperature?: number;
    };

    memory: {
        total: number;
        free: number;
        used: number;
        usedPercent: number;
        swapTotal: number;
        swapUsed: number;
    };

    disks: Array<{
        device: string;
        type: string;
        name: string;
        size: number;
        used: number;
        available: number;
        usedPercent: number;
        mount: string;
    }>;

    session: {
        currentUser: string;
        uptime: number;
        bootTime: number;
        processes: number;
        activeUsers: Array<{
            user: string;
            sessionName: string;
            state: string;
            sessionId: string;
        }>;
    };

    os: {
        platform: string;
        distro: string;
        release: string;
        arch: string;
        hostname: string;
    };

    network: Array<{
        interface: string;
        addresses: Array<{
            type: string;
            address: string;
            netmask: string;
        }>;
        mac: string | null;
        isUp: boolean;
        speed: number | null;  // Mbps
        bytesSent: number;
        bytesRecv: number;
        packetsSent: number;
        packetsRecv: number;
        errorsIn: number;
        errorsOut: number;
        dropsIn: number;
        dropsOut: number;
    }>;

    networkStats: {
        totalBytesSent: number;
        totalBytesRecv: number;
        uploadSpeed: number;  // KB/s
        downloadSpeed: number;  // KB/s
        activeConnections: number;
        tcpEstablished: number;
        tcpListen: number;
    };

    networkSummary: {
        primaryIP: string;
        publicIP: string | null;
        interfaceCount: number;
        vpnDetected: boolean;
        virtualAdapters: string[];
    };

    restPeriod: {
        startMinute: number;  // 0-59
        endMinute: number;    // 0-59
    };

    topProcesses?: Array<{
        pid: number;
        name: string;
        cpu: number;
        mem: number;
    }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function logMessage(msg: string): void {
    console.log(`[${new Date().toISOString()}] [SystemMonitor] ${msg}`);
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Generate a deterministic machine ID based on hardware characteristics.
 * This ID will remain stable even if the cache file is deleted.
 * 
 * Priority order:
 * 1. Provided machineId (command-line arg)
 * 2. Cached ID from file
 * 3. Generated from hardware (MAC + hostname + platform)
 */
function generateHardwareBasedId(): string {
    // Get primary network interface MAC address
    const interfaces = os.networkInterfaces();
    let primaryMac = '';

    // Find the first non-internal, active interface with a MAC
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
            // Skip internal (loopback), virtual adapters, and interfaces without MAC
            if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
                primaryMac = addr.mac;
                break;
            }
        }
        if (primaryMac) break;
    }

    // Fallback if no valid MAC found
    if (!primaryMac) {
        primaryMac = 'no-mac-found';
    }

    // Combine multiple stable hardware/system identifiers
    const hostname = os.hostname() || 'unknown-host';
    const platform = os.platform();
    const arch = os.arch();
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown-cpu';

    // Create deterministic hash from hardware characteristics
    const hash = createHash('sha256');
    hash.update(`${primaryMac}|${hostname}|${platform}|${arch}|${cpuModel}`);

    // Get first 16 chars of hex
    const hexId = hash.digest('hex').substring(0, 16);

    // Format as MT5-xxxx-xxxx-xxxx-xxxx (more readable)
    return `MT5-${hexId.substring(0, 4)}-${hexId.substring(4, 8)}-${hexId.substring(8, 12)}-${hexId.substring(12, 16)}`;
}

function getMachineIdCachePath(): string {
    // Store in user's home directory (survives app reinstalls)
    const homeDir = os.homedir();
    const cacheDir = path.join(homeDir, '.mt5-monitor');

    // Ensure directory exists
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }

    return path.join(cacheDir, 'machine-id');
}

function loadOrCreateMachineId(provided?: string): string {
    // 1. Use provided ID if given
    if (provided) {
        return provided;
    }

    const cachePath = getMachineIdCachePath();

    // 2. Try to load from cache
    try {
        if (fs.existsSync(cachePath)) {
            const cached = fs.readFileSync(cachePath, 'utf-8').trim();
            if (cached) {
                logMessage(`Machine ID loaded from cache: ${cachePath}`);
                return cached;
            }
        }
    } catch (err) {
        logMessage(`Warning: Could not read machine ID cache: ${err}`);
    }

    // 3. Generate new ID based on hardware
    const machineId = generateHardwareBasedId();

    // 4. Save to cache for faster future reads
    try {
        fs.writeFileSync(cachePath, machineId, 'utf-8');
        logMessage(`Machine ID generated and cached: ${cachePath}`);
    } catch (err) {
        logMessage(`Warning: Could not write machine ID cache: ${err}`);
    }

    return machineId;
}

/** Get the real backend directory, supporting Electron ASAR packaging */
function getBackendDir(): string {
    if (__dirname.includes('app.asar')) {
        // Inside ASAR, extraResources are placed in resources/backend/bin
        const g = global as any;
        if (g.process && g.process.resourcesPath) {
            return path.join(g.process.resourcesPath, 'backend', 'bin');
        }
        return path.join(__dirname, '..', '..', 'backend', 'bin');
    }
    return path.join(__dirname, 'bin');
}

/** Resolve the Python interpreter to use. Prefer `python`, fall back to `python3`. */
function resolvePython(): string {
    // On Windows the launcher is usually just `python`; on Linux/macOS `python3`.
    return os.platform() === 'win32' ? 'python' : 'python3';
}

/** Check if current time is within the rest period (no POST). */
function isQuietWindow(restStart: number, restEnd: number, date = new Date()): boolean {
    const m = date.getMinutes();
    if (restStart === restEnd) {
        // Only rest at that specific minute
        return m === restStart;
    } else if (restStart > restEnd) {
        // Wrap around hour boundary (e.g., 55-5 means 55-59 and 0-5)
        return m >= restStart || m <= restEnd;
    } else {
        // Normal range (e.g., 10-15)
        return m >= restStart && m <= restEnd;
    }
}

// ── Main service ─────────────────────────────────────────────────────────────

class SystemMonitorService {
    private readonly serverUrl: string;
    private readonly intervalSeconds: number;
    private readonly machineId: string;
    private readonly apiKey: string;
    private readonly pythonScript: string;
    private readonly restStart: number;
    private readonly restEnd: number;

    private pyProc: ChildProcessByStdio<null, Readable, Readable> | null = null;
    private lineBuffer = '';
    private isSending = false;
    private stopped = false;
    private restartTimer?: NodeJS.Timeout;

    constructor(serverUrl: string, intervalSeconds: number, restStart: number, restEnd: number, machineId?: string, apiKey?: string) {
        this.serverUrl = resolveMonitorIngestUrl(serverUrl);
        this.intervalSeconds = Math.max(10, intervalSeconds);
        this.restStart = Math.max(0, Math.min(59, restStart));
        this.restEnd = Math.max(0, Math.min(59, restEnd));
        this.machineId = loadOrCreateMachineId(machineId);
        this.apiKey = (apiKey || process.env.SYSTEM_MONITOR_API_KEY || '').trim();
        const backendDir = getBackendDir();
        // system_monitor.py sits in backend/bin next to the packaged executable
        this.pythonScript = path.join(backendDir, 'system_monitor.py');

        logMessage(`Server  : ${this.serverUrl}`);
        logMessage(`Interval: ${this.intervalSeconds}s`);
        logMessage(`Machine : ${this.machineId}`);
        logMessage(`Script  : ${this.pythonScript}`);
        logMessage(`Rest    : local :${String(this.restStart).padStart(2, '0')}–:${String(this.restEnd).padStart(2, '0')} each hour (no collect/POST)`);
        if (this.apiKey) {
            logMessage(`Auth    : ${AGENT_API_KEY_HEADER} configured`);
        } else {
            logMessage(`Auth    : WARNING – ${AGENT_API_KEY_HEADER} not set (set SYSTEM_MONITOR_API_KEY in .env)`);
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    public start(): void {
        logMessage('Starting Python monitor daemon...');
        this.spawnPython();
    }

    public async stop(): Promise<void> {
        this.stopped = true;
        if (this.restartTimer) clearTimeout(this.restartTimer);

        if (this.apiKey) {
            try {
                const result = await sendMonitorDisconnect(this.serverUrl, this.apiKey, this.machineId);
                if (result.ok) {
                    logMessage(`✓ ${result.message}`);
                } else {
                    logMessage(`✗ Disconnect: ${result.message}`);
                }
            } catch (err: any) {
                logMessage(`✗ Disconnect: ${err?.message || err}`);
            }
        }

        if (this.pyProc) {
            this.pyProc.kill('SIGTERM');
            this.pyProc = null;
        }
        logMessage('System monitor stopped.');
    }

    // ── Python subprocess ─────────────────────────────────────────────────

    private spawnPython(): void {
        if (this.stopped) return;

        const exePath = path.join(getBackendDir(), 'system_monitor.exe');
        const hasExe = fs.existsSync(exePath);

        let cmd: string;
        let args: string[];

        if (hasExe) {
            cmd = exePath;
            args = [
                '--interval', String(this.intervalSeconds),
                '--machine-id', this.machineId,
                '--rest-start', String(this.restStart),
                '--rest-end', String(this.restEnd),
            ];
            logMessage(`Spawning standalone executable: ${cmd} ${args.join(' ')}`);
        } else {
            const python = resolvePython();
            cmd = python;
            args = [
                this.pythonScript,
                '--interval', String(this.intervalSeconds),
                '--machine-id', this.machineId,
                '--rest-start', String(this.restStart),
                '--rest-end', String(this.restEnd),
            ];
            logMessage(`Spawning python script: ${cmd} ${args.join(' ')}`);
        }

        const proc = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,  // Hide CMD window on Windows
            // inherit current env so pip-installed psutil is reachable
            env: { ...process.env },
        });

        this.pyProc = proc;
        this.lineBuffer = '';

        // ── stdout: JSON lines ───────────────────────────────────────────
        proc.stdout.setEncoding('utf-8');
        proc.stdout.on('data', (chunk: string) => {
            this.lineBuffer += chunk;
            let nl: number;
            while ((nl = this.lineBuffer.indexOf('\n')) !== -1) {
                const line = this.lineBuffer.slice(0, nl).trim();
                this.lineBuffer = this.lineBuffer.slice(nl + 1);
                if (line) this.handleJsonLine(line);
            }
        });

        // ── stderr: forward to our log ───────────────────────────────────
        proc.stderr.setEncoding('utf-8');
        proc.stderr.on('data', (chunk: string) => {
            chunk.trim().split('\n').forEach(l => l && logMessage(`[py] ${l.trim()}`));
        });

        // ── exit: auto-restart unless we stopped deliberately ────────────
        proc.on('exit', (code, signal) => {
            logMessage(`Process exited (code=${code}, signal=${signal})`);
            this.pyProc = null;
            if (!this.stopped) {
                logMessage('Restarting process in 5 s...');
                this.restartTimer = setTimeout(() => this.spawnPython(), 5_000);
            }
        });

        proc.on('error', (err) => {
            logMessage(`Spawn error: ${err.message}`);
            if (hasExe) {
                logMessage(`Make sure standalone executable ${exePath} is valid.`);
            } else {
                logMessage('Make sure Python is installed and `psutil` is available (pip install psutil).');
            }
        });
    }

    // ── Data handling ─────────────────────────────────────────────────────

    private handleJsonLine(line: string): void {
        try {
            const raw = JSON.parse(line) as SystemInfo;
            this.sendToServer(raw);
        } catch (err) {
            logMessage(`JSON parse error: ${err}  line=${line.slice(0, 80)}`);
        }
    }

    private async sendToServer(data: SystemInfo): Promise<void> {
        if (isQuietWindow(this.restStart, this.restEnd)) {
            logMessage(`Quiet window (local :${String(this.restStart).padStart(2, '0')}–:${String(this.restEnd).padStart(2, '0')}) – skip POST`);
            return;
        }
        if (this.isSending) {
            logMessage('Previous send still in-flight, skipping.');
            return;
        }
        this.isSending = true;
        try {
            if (!this.apiKey) {
                throw new Error(
                    `Missing ${AGENT_API_KEY_HEADER} (set SYSTEM_MONITOR_API_KEY in .env at project root)`,
                );
            }

            const body = JSON.stringify(data);
            const response = await fetch(this.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': `SystemMonitor/${this.machineId}`,
                    [AGENT_API_KEY_HEADER]: this.apiKey,
                },
                body,
                signal: AbortSignal.timeout(15_000),
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    throw new Error(
                        `HTTP ${response.status}: API key rejected – check SYSTEM_MONITOR_API_KEY matches server .env`,
                    );
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            writeMonitorSession(data.machineId, this.serverUrl);
            logMessage(`✓ Sent (${formatBytes(body.length)})  cpu=${data.cpu.currentLoad.toFixed(1)}%  mem=${data.memory.usedPercent.toFixed(1)}% temp=${data.cpu.temperature ?? 'N/A'}°C`);
        } catch (err: any) {
            logMessage(`✗ Send failed: ${err.message}`);
        } finally {
            this.isSending = false;
        }
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node systemMonitor.js <server-url> <interval-seconds> [rest-start] [rest-end] [machine-id] [api-key]');
    console.error('Example: node systemMonitor.js http://localhost:3000 30 55 5');
    console.error('  rest-start: Rest period start minute (0-59), default 55');
    console.error('  rest-end: Rest period end minute (0-59), default 5');
    process.exit(1);
}

const [serverUrl, intervalStr, restStartStr, restEndStr, machineId, apiKeyArg] = args;
const interval = parseInt(intervalStr, 10);
const restStart = restStartStr ? parseInt(restStartStr, 10) : 55;
const restEnd = restEndStr ? parseInt(restEndStr, 10) : 5;

if (isNaN(interval) || interval < 1) {
    console.error('Interval must be a positive integer (minimum 1 second, effective minimum 10 s).');
    process.exit(1);
}
if (isNaN(restStart) || restStart < 0 || restStart > 59) {
    console.error('rest-start must be 0-59');
    process.exit(1);
}
if (isNaN(restEnd) || restEnd < 0 || restEnd > 59) {
    console.error('rest-end must be 0-59');
    process.exit(1);
}
try { new URL(serverUrl); } catch {
    console.error('Invalid server URL.');
    process.exit(1);
}

const monitor = new SystemMonitorService(serverUrl, interval, restStart, restEnd, machineId, apiKeyArg);
monitor.start();

async function shutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received.`);
    await monitor.stop();
    process.exit(0);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

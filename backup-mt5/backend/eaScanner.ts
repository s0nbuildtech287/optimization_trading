/**
 * EA Scanner Service â€“ Node.js side
 *
 * Architecture:
 *   Python (ea_scanner.py)  â”€â”€JSONâ”€â”€â–º  this process  â”€â”€POSTâ”€â”€â–º  server (optional)
 *
 * Usage:
 *   node eaScanner.js scan
 *   node eaScanner.js sync <server-url>
 *   node eaScanner.js daemon <server-url> <interval-seconds>
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
import { AGENT_API_KEY_HEADER } from '../utils/systemMonitorApi';

function loadEnv(): void {
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

loadEnv();

export const DEFAULT_SCAN_BOT_PATH = '/api/v1/expert-advisors/sync';

export interface EAScannerBot {
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

export interface EAScannerTerminalReport {
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

export interface EAScannerResult {
    pc_name: string;
    machine_id: string;
    timestamp: number;
    active_terminal_count: number;
    message?: string;
    offline_terminals?: EAScannerTerminalReport[];
    terminals: EAScannerTerminalReport[];
    bots: EAScannerBot[];
    summary: {
        total_tpl: number;
        total_active: number;
        total_missing: number;
        total_errors: number;
    };
}

function logMessage(msg: string): void {
    // Keep stdout reserved for machine-readable JSON; parent processes parse it directly.
    console.error(`[${new Date().toISOString()}] [EAScanner] ${msg}`);
}

function isQuietWindow(restStart: number, restEnd: number, date = new Date()): boolean {
    const minute = date.getMinutes();
    if (restStart === restEnd) return minute === restStart;
    if (restStart > restEnd) return minute >= restStart || minute <= restEnd;
    return minute >= restStart && minute <= restEnd;
}

function getBackendDir(): string {
    if (__dirname.includes('app.asar')) {
        const g = global as typeof globalThis & { process?: { resourcesPath?: string } };
        if (g.process?.resourcesPath) {
            return path.join(g.process.resourcesPath, 'backend', 'bin');
        }
        return path.join(__dirname, '..', '..', 'backend', 'bin');
    }
    return path.join(__dirname, 'bin');
}

function resolvePython(): string {
    return os.platform() === 'win32' ? 'python' : 'python3';
}

function generateHardwareBasedId(): string {
    const interfaces = os.networkInterfaces();
    let primaryMac = '';

    for (const addrs of Object.values(interfaces)) {
        if (!addrs) continue;
        for (const addr of addrs) {
            if (!addr.internal && addr.mac && addr.mac !== '00:00:00:00:00:00') {
                primaryMac = addr.mac;
                break;
            }
        }
        if (primaryMac) break;
    }

    if (!primaryMac) {
        primaryMac = 'no-mac-found';
    }

    const hostname = os.hostname() || 'unknown-host';
    const platformName = os.platform();
    const arch = os.arch();
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown-cpu';

    const hash = createHash('sha256');
    hash.update(`${primaryMac}|${hostname}|${platformName}|${arch}|${cpuModel}`);
    const hexId = hash.digest('hex').slice(0, 16);
    return `MT5-${hexId.slice(0, 4)}-${hexId.slice(4, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}`;
}

function getMachineIdCachePath(): string {
    const homeDir = os.homedir();
    const cacheDir = path.join(homeDir, '.mt5-monitor');
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    return path.join(cacheDir, 'machine-id');
}

function loadOrCreateMachineId(provided?: string): string {
    if (provided?.trim()) {
        return provided.trim();
    }

    const cachePath = getMachineIdCachePath();
    try {
        if (fs.existsSync(cachePath)) {
            const cached = fs.readFileSync(cachePath, 'utf-8').trim();
            if (cached) {
                return cached;
            }
        }
    } catch {
        // Ignore cache read errors and regenerate.
    }

    const machineId = generateHardwareBasedId();
    try {
        fs.writeFileSync(cachePath, machineId, 'utf-8');
    } catch {
        // Ignore cache write errors; the id is still usable.
    }
    return machineId;
}

export function resolveScanBotUrl(serverUrl: string): string {
    const trimmed = serverUrl.trim();
    if (!trimmed) return trimmed;

    const u = new URL(trimmed);
    const normalizedPath = u.pathname.replace(/\/+$/, '');
    if (!u.pathname || u.pathname === '/') {
        u.pathname = DEFAULT_SCAN_BOT_PATH;
        u.search = '';
        u.hash = '';
        return u.toString();
    }

    if (normalizedPath.endsWith(DEFAULT_SCAN_BOT_PATH)) {
        return u.toString();
    }

    if (!u.pathname.includes('scan-bot')) {
        u.pathname = u.pathname.replace(/\/?$/, '') + DEFAULT_SCAN_BOT_PATH;
    }

    return u.toString();
}

function spawnPythonScanner(scanPaths: string[] = []): Promise<EAScannerResult> {
    return new Promise((resolve, reject) => {
        const backendDir = getBackendDir();
        const exePath = path.join(backendDir, 'ea_scanner.exe');
        const pyPath = path.join(backendDir, 'ea_scanner.py');
        const machineId = loadOrCreateMachineId(process.env.EA_SCANNER_MACHINE_ID);
        const hasExe = fs.existsSync(exePath);

        let cmd: string;
        let args: string[];

        if (hasExe) {
            cmd = exePath;
            args = ['--json', ...scanPaths.flatMap((scanPath) => ['--path', scanPath])];
            logMessage(`Spawning: ${cmd}`);
        } else if (fs.existsSync(pyPath)) {
            cmd = resolvePython();
            args = [pyPath, '--json', ...scanPaths.flatMap((scanPath) => ['--path', scanPath])];
            logMessage(`Spawning: ${cmd} ${args.join(' ')}`);
        } else {
            reject(new Error(`EA scanner script not found in ${backendDir}`));
            return;
        }

        const proc = spawn(cmd, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            env: {
                ...process.env,
                EA_SCANNER_MACHINE_ID: machineId,
            },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.setEncoding('utf-8');
        proc.stdout.on('data', (chunk: string) => { stdout += chunk; });

        proc.stderr.setEncoding('utf-8');
        proc.stderr.on('data', (chunk: string) => { stderr += chunk; });

        proc.on('error', (err) => reject(err));

        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(stderr.trim() || `EA scanner exited with code ${code}`));
                return;
            }

            const trimmed = stdout.trim();
            if (!trimmed) {
                reject(new Error('EA scanner returned empty output'));
                return;
            }

            try {
                resolve(JSON.parse(trimmed) as EAScannerResult);
            } catch (err) {
                reject(new Error(`Failed to parse scanner JSON: ${err}. Output: ${trimmed.slice(0, 200)}`));
            }
        });
    });
}

export async function runEaScannerScan(scanPaths: string[] = []): Promise<EAScannerResult> {
    return spawnPythonScanner(scanPaths);
}

function buildBotSyncPayload(scan: EAScannerResult): Record<string, unknown> {
    const reports = [
        ...(scan.terminals || []).map((terminal) => ({
            ...terminal,
            status: 'ONLINE' as const,
            snapshot_complete: terminal.live_snapshot === true || terminal.realtime_source === 'CHR_FALLBACK',
        })),
        ...(scan.offline_terminals || []).map((terminal) => ({
            ...terminal,
            algotrading: null,
            status: 'OFFLINE' as const,
            snapshot_complete: true,
            bots: [],
        })),
    ];

    const terminals = reports.map((terminal) => ({
        terminal_key: `${scan.machine_id}:${terminal.path}`,
        path: terminal.path,
        user: terminal.user,
        cluster: terminal.cluster,
        terminal: terminal.terminal,
        account: terminal.account,
        server: terminal.server,
        algotrading: terminal.algotrading,
        status: terminal.status,
        snapshot_complete: terminal.snapshot_complete,
        realtime_source: terminal.realtime_source,
        snapshot_status: terminal.snapshot_status,
        snapshot_age_seconds: terminal.snapshot_age_seconds,
        bots: terminal.status === 'OFFLINE' ? [] : (scan.bots || [])
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
    }));

    return {
        version: 1,
        scan_timestamp: scan.timestamp,
        machine: {
            machine_id: scan.machine_id,
            pc_name: scan.pc_name,
        },
        terminals,
    };
}

export async function sendBotsToServer(
    serverUrl: string,
    scanResult: EAScannerResult,
    apiKey?: string,
): Promise<{ ok: boolean; message: string; url: string; count: number }> {
    const key = (apiKey || process.env.SYSTEM_MONITOR_API_KEY || '').trim();
    if (!key) {
        throw new Error(`Missing ${AGENT_API_KEY_HEADER} (set SYSTEM_MONITOR_API_KEY in .env)`);
    }

    const url = resolveScanBotUrl(serverUrl);
    if (!Array.isArray(scanResult.bots)) {
        throw new Error('EA scanner result is invalid: bots must be an array');
    }
    const bots = scanResult.bots;
    const payload = buildBotSyncPayload(scanResult);
    const body = JSON.stringify(payload);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': `EAScanner/${scanResult.pc_name}`,
            [AGENT_API_KEY_HEADER]: key,
        },
        body,
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText}${text ? ` â€“ ${text.slice(0, 160)}` : ''}`);
    }

    return {
        ok: true,
        message: `Sent ${bots.length} bot(s) to ${url}`,
        url,
        count: bots.length,
    };
}

export async function runEaScannerSync(serverUrl: string, apiKey?: string, scanPaths: string[] = []): Promise<{
    scan: EAScannerResult;
    post: { ok: boolean; message: string; url: string; count: number };
}> {
    const scan = await runEaScannerScan(scanPaths);
    const post = await sendBotsToServer(serverUrl, scan, apiKey);
    return { scan, post };
}

class EAScannerDaemon {
    private readonly serverUrl: string;
    private readonly intervalSeconds: number;
    private readonly apiKey: string;
    private readonly scanPaths: string[];
    private readonly restStart: number;
    private readonly restEnd: number;
    private timer?: NodeJS.Timeout;
    private stopped = false;
    private isRunning = false;

    constructor(serverUrl: string, intervalSeconds: number, apiKey?: string, scanPaths: string[] = [], restStart = 55, restEnd = 5) {
        this.serverUrl = resolveScanBotUrl(serverUrl);
        this.intervalSeconds = Math.max(30, intervalSeconds);
        this.apiKey = (apiKey || process.env.SYSTEM_MONITOR_API_KEY || '').trim();
        this.scanPaths = scanPaths;
        this.restStart = Math.max(0, Math.min(59, restStart));
        this.restEnd = Math.max(0, Math.min(59, restEnd));
        logMessage(`Server  : ${this.serverUrl}`);
        logMessage(`Interval: ${this.intervalSeconds}s`);
        logMessage(`Rest    : local :${String(this.restStart).padStart(2, '0')}â€“:${String(this.restEnd).padStart(2, '0')} each hour (no scan/POST)`);
        if (this.apiKey) {
            logMessage(`Auth    : ${AGENT_API_KEY_HEADER} configured`);
        } else {
            logMessage(`Auth    : WARNING â€“ ${AGENT_API_KEY_HEADER} not set`);
        }
    }

    start(): void {
        logMessage('Starting EA scanner sync daemon...');
        void this.tick();
        this.timer = setInterval(() => { void this.tick(); }, this.intervalSeconds * 1000);
    }

    stop(): void {
        this.stopped = true;
        if (this.timer) clearInterval(this.timer);
        logMessage('EA scanner sync stopped.');
    }

    private async tick(): Promise<void> {
        if (this.stopped || this.isRunning) {
            if (this.isRunning) logMessage('Previous sync still in-flight, skipping.');
            return;
        }

        this.isRunning = true;
        try {
            if (isQuietWindow(this.restStart, this.restEnd)) {
                logMessage(`Quiet window (local :${String(this.restStart).padStart(2, '0')}â€“:${String(this.restEnd).padStart(2, '0')}) â€“ skip scan/POST`);
                return;
            }
            const scan = await runEaScannerScan(this.scanPaths);
            const post = await sendBotsToServer(this.serverUrl, scan, this.apiKey);
            logMessage(
                `âœ“ Sync OK â€“ terminals=${scan.active_terminal_count} bots=${post.count} ` +
                `missing=${scan.summary.total_missing} errors=${scan.summary.total_errors}`,
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logMessage(`âœ— Sync failed: ${msg}`);
        } finally {
            this.isRunning = false;
        }
    }
}

async function runCli(): Promise<void> {
    const [mode, ...rest] = process.argv.slice(2);
    const extractPaths = (values: string[]): string[] => values.filter((value) => value !== '--path');

    if (mode === 'scan') {
        const result = await runEaScannerScan(extractPaths(rest));
        process.stdout.write(JSON.stringify(result, null, 2));
        return;
    }

    if (mode === 'sync') {
        const serverUrl = rest[0];
        if (!serverUrl) {
            console.error('Usage: node eaScanner.js sync <server-url>');
            process.exit(1);
        }
        const { scan, post } = await runEaScannerSync(serverUrl, rest[1], extractPaths(rest.slice(2)));
        console.log(JSON.stringify({ scan, post }, null, 2));
        return;
    }

    if (mode === 'daemon') {
        const serverUrl = rest[0];
        const intervalStr = rest[1] || '300';
        if (!serverUrl) {
            console.error('Usage: node eaScanner.js daemon <server-url> <interval-seconds>');
            process.exit(1);
        }
        const interval = parseInt(intervalStr, 10);
        if (isNaN(interval) || interval < 30) {
            console.error('Interval must be at least 30 seconds.');
            process.exit(1);
        }

        const restStart = rest[2] ? parseInt(rest[2], 10) : 55;
        const restEnd = rest[3] ? parseInt(rest[3], 10) : 5;
        if (isNaN(restStart) || restStart < 0 || restStart > 59 || isNaN(restEnd) || restEnd < 0 || restEnd > 59) {
            console.error('rest-start and rest-end must be 0-59.');
            process.exit(1);
        }

        const daemon = new EAScannerDaemon(serverUrl, interval, undefined, extractPaths(rest.slice(4)), restStart, restEnd);
        daemon.start();

        const shutdown = (signal: string) => {
            console.log(`\n${signal} received.`);
            daemon.stop();
            process.exit(0);
        };
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        return;
    }

    console.error('Usage:');
    console.error('  node eaScanner.js scan');
    console.error('  node eaScanner.js sync <server-url>');
    console.error('  node eaScanner.js daemon <server-url> <interval-seconds>');
    process.exit(1);
}

if (require.main === module) {
    runCli().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}




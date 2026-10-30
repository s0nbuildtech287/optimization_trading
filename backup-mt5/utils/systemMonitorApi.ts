/**
 * Shared helpers for system monitor HTTP calls (ingest URL → disconnect URL).
 */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';

export const AGENT_API_KEY_HEADER = 'X-Agent-API-Key';
export const DEFAULT_MONITOR_INGEST_PATH = '/api/v1/system-monitor/ingest';
export const DEFAULT_MONITOR_DISCONNECT_PATH = '/api/v1/system-monitor/disconnect';
export const DEFAULT_EXPERT_JOURNAL_UPLOAD_PATH = '/api/v1/expert-journal/file-data';

const MACHINE_ID_STATE_FILE = '.system-monitor-state.json';
const MONITOR_SESSION_FILE = '.system-monitor-session.json';

export interface MonitorSession {
    machineId: string;
    serverUrl?: string;
    updatedAt?: number;
}

export function getMachineIdStatePath(): string {
    return path.join(os.tmpdir(), MACHINE_ID_STATE_FILE);
}

export function getMonitorSessionPath(): string {
    return path.join(os.tmpdir(), MONITOR_SESSION_FILE);
}

/** Last machineId used for a successful ingest POST (matches server cache key). */
export function writeMonitorSession(machineId: string, serverUrl: string): void {
    try {
        fs.writeFileSync(
            getMonitorSessionPath(),
            JSON.stringify({ machineId, serverUrl, updatedAt: Date.now() }, null, 2),
        );
    } catch { /* ignore */ }
}

function isPathOnly(value: string): boolean {
    return !value || !value.startsWith('/');
}

/** Resolve the ingest URL from either a bare origin or a full ingest URL. */
export function resolveMonitorIngestUrl(serverUrl: string): string {
    const trimmed = serverUrl.trim();
    if (!trimmed) return trimmed;

    const u = new URL(trimmed);
    if (isPathOnly(u.pathname) || u.pathname === '/') {
        u.pathname = DEFAULT_MONITOR_INGEST_PATH;
        u.search = '';
        u.hash = '';
        return u.toString();
    }

    return u.toString();
}

/** Resolve the expert-journal file upload URL from either a bare origin or a full path. */
export function resolveExpertJournalUploadUrl(serverUrl: string): string {
    const trimmed = serverUrl.trim();
    if (!trimmed) return trimmed;

    const u = new URL(trimmed);
    if (isPathOnly(u.pathname) || u.pathname === '/') {
        u.pathname = DEFAULT_EXPERT_JOURNAL_UPLOAD_PATH;
        u.search = '';
        u.hash = '';
        return u.toString();
    }

    if (!u.pathname.includes('expert-journal')) {
        u.pathname = u.pathname.replace(/\/?$/, '') + DEFAULT_EXPERT_JOURNAL_UPLOAD_PATH;
    }

    return u.toString();
}

export function readMonitorSession(): MonitorSession | null {
    try {
        const sessionPath = getMonitorSessionPath();
        if (!fs.existsSync(sessionPath)) return null;
        const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as MonitorSession;
        return session.machineId ? session : null;
    } catch {
        return null;
    }
}

export function clearMonitorSession(): void {
    try {
        const sessionPath = getMonitorSessionPath();
        if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    } catch { /* ignore */ }
}

export function readMonitorMachineId(): string | null {
    const session = readMonitorSession();
    if (session?.machineId) return session.machineId;

    try {
        const statePath = getMachineIdStatePath();
        if (fs.existsSync(statePath)) {
            const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
            if (state.machineId) return state.machineId as string;
        }
    } catch { /* ignore */ }
    return null;
}

/**
 * Derive disconnect URL from ingest URL.
 * Simply replace /ingest with /disconnect at the end of the path.
 * Examples:
 *   .../system-monitor/ingest  → .../system-monitor/disconnect
 *   .../api/v1/system-monitor/ingest → .../api/v1/system-monitor/disconnect
 */
export function resolveDisconnectUrl(ingestUrl: string): string {
    const fromEnv = process.env.SYSTEM_MONITOR_DISCONNECT_URL?.trim();
    if (fromEnv) return fromEnv;

    // First resolve ingest URL (adds default path if needed)
    const resolvedIngest = resolveMonitorIngestUrl(ingestUrl);

    // Replace /ingest with /disconnect in the path
    const u = new URL(resolvedIngest);

    // Try to replace /ingest with /disconnect
    if (u.pathname.includes('/ingest')) {
        u.pathname = u.pathname.replace(/\/ingest(\/?)$/, '/disconnect$1');
    } else {
        // Fallback: no /ingest found, use default disconnect path
        u.pathname = DEFAULT_MONITOR_DISCONNECT_PATH;
    }

    return u.toString();
}

/** Post JSON using Node's built-in http/https (works in all Electron/Node versions). */
function httpPost(
    urlStr: string,
    headers: Record<string, string>,
    body: string,
    timeoutMs = 10_000,
): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const lib = u.protocol === 'https:' ? https : http;
        
        // Normalize hostname: localhost → 127.0.0.1, ::1 → 127.0.0.1 (avoid IPv6 ECONNREFUSED)
        let hostname = u.hostname;
        if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') {
            hostname = '127.0.0.1';
        }
        
        const options = {
            hostname: hostname,
            port: u.port || (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname + u.search,
            method: 'POST',
            headers: {
                ...headers,
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = lib.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

export async function sendMonitorDisconnect(
    ingestUrl: string,
    apiKey: string,
    machineId?: string | null,
): Promise<{ ok: boolean; message: string; url?: string; machineId?: string }> {
    const id = (machineId ?? readMonitorMachineId())?.trim();
    if (!id) {
        return { ok: false, message: 'No machineId (no active session / state file)' };
    }
    if (!apiKey.trim()) {
        return { ok: false, message: 'Missing API key' };
    }

    const url = resolveDisconnectUrl(ingestUrl);
    const bodyStr = JSON.stringify({ machineId: id });
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        [AGENT_API_KEY_HEADER]: apiKey.trim(),
        'User-Agent': `SystemMonitor/${id}`,
    };

    const res = await httpPost(url, headers, bodyStr);

    if (res.statusCode < 200 || res.statusCode >= 300) {
        return {
            ok: false,
            url,
            machineId: id,
            message: `POST ${url} → HTTP ${res.statusCode}${res.body ? ` (${res.body.slice(0, 160)})` : ''}`,
        };
    }

    let serverMessage = '';
    try {
        const parsed = JSON.parse(res.body) as { message?: string };
        if (parsed.message) serverMessage = ` – ${parsed.message}`;
    } catch { /* ignore */ }

    clearMonitorSession();

    return {
        ok: true,
        url,
        machineId: id,
        message: `Disconnect OK: ${id} @ ${url}${serverMessage}`,
    };
}

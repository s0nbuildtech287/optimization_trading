import { randomUUID } from 'crypto';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';

export type Mt5WorkerStatus = 'offline' | 'starting' | 'online' | 'stopping' | 'error';
export type Mt5WorkerActivity = 'idle' | 'running';

export interface Mt5WorkerConnection {
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

export interface Mt5WorkerDefinition {
  id: string;
  workerInstanceId: string;
  workerName: string;
  terminalPath: string;
  terminalDataPath: string;
  strategiesDir: string;
  workspaceRoot: string;
  autoStart: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Mt5WorkerView extends Mt5WorkerDefinition {
  status: Mt5WorkerStatus;
  activity: Mt5WorkerActivity;
  currentJob: string | null;
  jobsClaimed: number;
  pid: number | null;
  lastError: string | null;
}

interface PersistedWorkerConfig {
  version: 1;
  connection: Mt5WorkerConnection;
  workers: Mt5WorkerDefinition[];
}

interface WorkerRuntimeState {
  process: ChildProcessWithoutNullStreams | null;
  status: Mt5WorkerStatus;
  activity: Mt5WorkerActivity;
  currentJob: string | null;
  jobsClaimed: number;
  lastError: string | null;
  stopRequested: boolean;
  logs: string[];
  stdoutBuffer: string;
  stderrBuffer: string;
}

const DEFAULT_CONNECTION: Mt5WorkerConnection = {
  serverUrl: 'http://127.0.0.1:5000',
  apiKey: '',
  heartbeatSeconds: 15,
  pollSeconds: 10,
  serverHealthTimeout: 60,
  serverHealthInterval: 3,
  maxAttempts: 2,
  retryDelay: 3,
  postExitGrace: 30,
};

const MAX_LOG_LINES = 500;

function normalizeServerUrl(value: string): string {
  let normalized = String(value || '').trim().replace(/\/+$/, '');
  if (normalized.endsWith('/api/v1')) normalized = normalized.slice(0, -7);
  return normalized;
}

function normalizePathKey(value: string): string {
  return path.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function requestJson(
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>,
  apiKey?: string,
  timeoutMs = 10000,
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const target = new URL(endpoint);
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const transport = target.protocol === 'https:' ? https : http;
    const request = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'MT5-Utilities-Worker/1.0',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(payload.length) } : {}),
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed: Record<string, any> = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          reject(new Error(`Server returned invalid JSON (${response.statusCode ?? 0})`));
          return;
        }
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(parsed.message || parsed.error || `HTTP ${response.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Server request timed out')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

export class Mt5WorkerManager {
  private readonly configPath: string;
  private readonly runtimeRoot: string;
  private readonly pythonExecutable: string;
  private config: PersistedWorkerConfig;
  private readonly runtime = new Map<string, WorkerRuntimeState>();
  private stateListener: (() => void) | null = null;
  private logListener: ((workerId: string, line: string) => void) | null = null;

  constructor(userDataPath: string, runtimeRoot: string, pythonExecutable: string) {
    this.configPath = path.join(userDataPath, 'mt5-workers.json');
    this.runtimeRoot = runtimeRoot;
    this.pythonExecutable = pythonExecutable;
    this.config = this.loadConfig();
    this.config.workers.forEach((worker) => this.ensureRuntime(worker.id));
  }

  setListeners(stateListener: () => void, logListener: (workerId: string, line: string) => void): void {
    this.stateListener = stateListener;
    this.logListener = logListener;
  }

  getSnapshot(): { connection: Mt5WorkerConnection; workers: Mt5WorkerView[] } {
    return {
      connection: { ...this.config.connection },
      workers: this.config.workers.map((worker) => this.toView(worker)),
    };
  }

  getLogs(workerId: string): string[] {
    return [...this.ensureRuntime(workerId).logs];
  }

  clearLogs(workerId: string): void {
    this.ensureRuntime(workerId).logs = [];
    this.emitState();
  }

  saveConnection(input: Partial<Mt5WorkerConnection>): Mt5WorkerConnection {
    this.config.connection = {
      ...this.config.connection,
      ...input,
      serverUrl: normalizeServerUrl(input.serverUrl ?? this.config.connection.serverUrl),
      apiKey: String(input.apiKey ?? this.config.connection.apiKey).trim(),
    };
    this.saveConfig();
    this.emitState();
    return { ...this.config.connection };
  }

  async testServer(serverUrl?: string): Promise<Record<string, any>> {
    const baseUrl = normalizeServerUrl(serverUrl ?? this.config.connection.serverUrl);
    if (!baseUrl) throw new Error('Server URL is required');
    return requestJson('GET', `${baseUrl}/api/mt5-queue/health`);
  }

  async verifyIdentity(serverUrl?: string, apiKey?: string): Promise<{ userId: string; label: string }> {
    const baseUrl = normalizeServerUrl(serverUrl ?? this.config.connection.serverUrl);
    const key = String(apiKey ?? this.config.connection.apiKey).trim();
    if (!baseUrl) throw new Error('Server URL is required');
    if (!key) throw new Error('API Key is required');
    const response = await requestJson('POST', `${baseUrl}/api/v1/apikeys/verify`, { api_key: key }, key);
    const data = response.data || response;
    return {
      userId: String(data.user_id ?? data.userId ?? '-'),
      label: String(data.label ?? 'Worker access'),
    };
  }

  createWorker(input: Partial<Mt5WorkerDefinition> = {}): Mt5WorkerView {
    const sequence = this.config.workers.length + 1;
    const now = new Date().toISOString();
    const id = randomUUID();
    const worker: Mt5WorkerDefinition = {
      id,
      workerInstanceId: randomUUID(),
      workerName: String(input.workerName || `MT5 Worker ${sequence}`),
      terminalPath: String(input.terminalPath || ''),
      terminalDataPath: String(input.terminalDataPath || ''),
      strategiesDir: String(input.strategiesDir || ''),
      workspaceRoot: String(input.workspaceRoot || path.join('C:\\mt5work\\workers', id)),
      autoStart: Boolean(input.autoStart),
      createdAt: now,
      updatedAt: now,
    };
    this.config.workers.push(worker);
    this.ensureRuntime(worker.id);
    this.saveConfig();
    this.appendLog(worker.id, 'Worker created. Configure paths before starting.');
    this.emitState();
    return this.toView(worker);
  }

  updateWorker(workerId: string, updates: Partial<Mt5WorkerDefinition>): Mt5WorkerView {
    const worker = this.requireWorker(workerId);
    const runtime = this.ensureRuntime(workerId);
    if (runtime.process) throw new Error('Stop the worker before changing its configuration');
    const immutable = { id: worker.id, workerInstanceId: worker.workerInstanceId, createdAt: worker.createdAt };
    Object.assign(worker, updates, immutable, { updatedAt: new Date().toISOString() });
    this.saveConfig();
    this.appendLog(workerId, 'Worker configuration saved.');
    this.emitState();
    return this.toView(worker);
  }

  deleteWorker(workerId: string): void {
    const runtime = this.ensureRuntime(workerId);
    if (runtime.process) throw new Error('Stop the worker before deleting it');
    this.config.workers = this.config.workers.filter((worker) => worker.id !== workerId);
    this.runtime.delete(workerId);
    this.saveConfig();
    this.emitState();
  }

  async startWorker(workerId: string): Promise<Mt5WorkerView> {
    const worker = this.requireWorker(workerId);
    const runtime = this.ensureRuntime(workerId);
    if (runtime.process) return this.toView(worker);
    this.validateWorker(worker);
    fs.mkdirSync(worker.workspaceRoot, { recursive: true });

    const executableRunner = path.join(this.runtimeRoot, 'mt5_worker_runner.exe');
    const sourceRunner = path.join(this.runtimeRoot, 'worker_runner_entry.py');
    let command: string;
    let args: string[];
    if (fs.existsSync(executableRunner)) {
      command = executableRunner;
      args = [];
    } else if (fs.existsSync(sourceRunner)) {
      command = this.pythonExecutable;
      args = [sourceRunner];
    } else {
      throw new Error(`MT5 Worker runtime not found in ${this.runtimeRoot}`);
    }

    const connection = this.config.connection;
    args.push(
      '--worker-instance-id', worker.workerInstanceId,
      '--worker-name', worker.workerName,
      '--server-url', connection.serverUrl,
      '--api-key', connection.apiKey,
      '--workspace-root', worker.workspaceRoot,
      '--mt5-path', worker.terminalPath,
      '--terminal-data-path', worker.terminalDataPath,
      '--strategies-dir', worker.strategiesDir,
      '--heartbeat-seconds', String(connection.heartbeatSeconds),
      '--poll-seconds', String(connection.pollSeconds),
      '--server-health-timeout', String(connection.serverHealthTimeout),
      '--server-health-interval', String(connection.serverHealthInterval),
      '--max-attempts', String(connection.maxAttempts),
      '--retry-delay', String(connection.retryDelay),
      '--post-exit-grace', String(connection.postExitGrace),
    );

    runtime.status = 'starting';
    runtime.activity = 'idle';
    runtime.stopRequested = false;
    runtime.lastError = null;
    this.appendLog(workerId, `Starting worker: ${worker.workerName}`);
    this.emitState();

    const child = spawn(command, args, {
      cwd: worker.workspaceRoot,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    runtime.process = child;
    child.stdout.on('data', (chunk) => this.consumeOutput(workerId, chunk.toString('utf8'), false));
    child.stderr.on('data', (chunk) => this.consumeOutput(workerId, chunk.toString('utf8'), true));
    child.on('error', (error) => {
      runtime.lastError = error.message;
      runtime.status = 'error';
      this.appendLog(workerId, `Worker process error: ${error.message}`);
      this.emitState();
    });
    child.on('exit', (code) => {
      runtime.process = null;
      runtime.status = runtime.stopRequested ? 'offline' : code === 0 ? 'offline' : 'error';
      runtime.activity = 'idle';
      runtime.currentJob = null;
      if (!runtime.stopRequested && code !== 0) runtime.lastError = `Worker exited with code ${code}`;
      this.appendLog(workerId, `Worker exited with code ${code ?? 'unknown'}.`);
      this.emitState();
    });
    return this.toView(worker);
  }

  async stopWorker(workerId: string): Promise<Mt5WorkerView> {
    const worker = this.requireWorker(workerId);
    const runtime = this.ensureRuntime(workerId);
    if (!runtime.process) {
      runtime.status = 'offline';
      return this.toView(worker);
    }
    runtime.stopRequested = true;
    runtime.status = 'stopping';
    this.emitState();
    try {
      await this.sendOfflineHeartbeat(worker);
      this.appendLog(workerId, 'Offline heartbeat sent.');
    } catch (error) {
      this.appendLog(workerId, `Offline heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const pid = runtime.process.pid;
    if (pid && process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('exit', () => resolve());
        killer.on('error', () => {
          runtime.process?.kill();
          resolve();
        });
      });
    } else {
      runtime.process.kill();
    }
    return this.toView(worker);
  }

  async restartWorker(workerId: string): Promise<Mt5WorkerView> {
    await this.stopWorker(workerId);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return this.startWorker(workerId);
  }

  async startAll(): Promise<void> {
    const errors: string[] = [];
    for (const worker of this.config.workers) {
      if (this.ensureRuntime(worker.id).process) continue;
      try {
        await this.startWorker(worker.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.appendLog(worker.id, `Start failed: ${message}`);
        errors.push(`${worker.workerName}: ${message}`);
      }
    }
    if (errors.length) throw new Error(errors.join('; '));
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.config.workers.map((worker) => this.stopWorker(worker.id)));
  }

  async startAutoWorkers(): Promise<void> {
    for (const worker of this.config.workers.filter((item) => item.autoStart)) {
      try {
        await this.startWorker(worker.id);
      } catch (error) {
        this.appendLog(worker.id, `Auto start failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private loadConfig(): PersistedWorkerConfig {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as Partial<PersistedWorkerConfig>;
      return {
        version: 1,
        connection: { ...DEFAULT_CONNECTION, ...(parsed.connection || {}) },
        workers: Array.isArray(parsed.workers) ? parsed.workers : [],
      };
    } catch {
      return { version: 1, connection: { ...DEFAULT_CONNECTION }, workers: [] };
    }
  }

  private saveConfig(): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(this.config, null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.configPath);
  }

  private requireWorker(workerId: string): Mt5WorkerDefinition {
    const worker = this.config.workers.find((item) => item.id === workerId);
    if (!worker) throw new Error('Worker not found');
    return worker;
  }

  private ensureRuntime(workerId: string): WorkerRuntimeState {
    let state = this.runtime.get(workerId);
    if (!state) {
      state = {
        process: null,
        status: 'offline',
        activity: 'idle',
        currentJob: null,
        jobsClaimed: 0,
        lastError: null,
        stopRequested: false,
        logs: [],
        stdoutBuffer: '',
        stderrBuffer: '',
      };
      this.runtime.set(workerId, state);
    }
    return state;
  }

  private toView(worker: Mt5WorkerDefinition): Mt5WorkerView {
    const runtime = this.ensureRuntime(worker.id);
    return {
      ...worker,
      status: runtime.status,
      activity: runtime.activity,
      currentJob: runtime.currentJob,
      jobsClaimed: runtime.jobsClaimed,
      pid: runtime.process?.pid ?? null,
      lastError: runtime.lastError,
    };
  }

  private validateWorker(worker: Mt5WorkerDefinition): void {
    if (!this.config.connection.serverUrl) throw new Error('Server URL is required');
    if (!this.config.connection.apiKey) throw new Error('API Key is required');
    if (!worker.workerName.trim()) throw new Error('Worker Name is required');
    if (!worker.terminalPath || !fs.existsSync(worker.terminalPath)) throw new Error('Terminal executable does not exist');
    if (!worker.terminalDataPath || !fs.existsSync(worker.terminalDataPath)) throw new Error('Terminal Data Path does not exist');
    if (!worker.strategiesDir) throw new Error('Strategies Save Directory is required');
    if (!worker.workspaceRoot) throw new Error('Workspace Root is required');

    const activeWorkers = this.config.workers.filter((item) => item.id !== worker.id && this.ensureRuntime(item.id).process);
    const duplicateDataPath = activeWorkers.find((item) => normalizePathKey(item.terminalDataPath) === normalizePathKey(worker.terminalDataPath));
    if (duplicateDataPath) throw new Error(`Terminal Data Path is already used by ${duplicateDataPath.workerName}`);
    const duplicateWorkspace = activeWorkers.find((item) => normalizePathKey(item.workspaceRoot) === normalizePathKey(worker.workspaceRoot));
    if (duplicateWorkspace) throw new Error(`Workspace Root is already used by ${duplicateWorkspace.workerName}`);
  }

  private consumeOutput(workerId: string, chunk: string, isError: boolean): void {
    const runtime = this.ensureRuntime(workerId);
    const bufferKey = isError ? 'stderrBuffer' : 'stdoutBuffer';
    const parts = `${runtime[bufferKey]}${chunk}`.split(/\r?\n/);
    runtime[bufferKey] = parts.pop() || '';
    parts.filter(Boolean).forEach((line) => {
      this.appendLog(workerId, isError ? `[stderr] ${line}` : line);
      this.updateRuntimeFromLine(workerId, line);
    });
  }

  private updateRuntimeFromLine(workerId: string, line: string): void {
    const runtime = this.ensureRuntime(workerId);
    const lower = line.toLowerCase();
    const claimed = line.match(/Claimed job:\s*(.+)$/i);
    if (claimed) {
      runtime.currentJob = claimed[1].trim();
      runtime.jobsClaimed += 1;
      runtime.activity = 'running';
      runtime.status = 'online';
    } else if (lower.includes('[worker] server healthy') || lower.includes('[worker] polling server for job') || lower.includes('[worker] no job available')) {
      runtime.status = 'online';
      if (lower.includes('polling server') || lower.includes('no job available')) {
        runtime.activity = 'idle';
        runtime.currentJob = null;
      }
    } else if (lower.includes('[worker] running optimize_only') || lower.includes('[worker] running backtest_only')) {
      runtime.status = 'online';
      runtime.activity = 'running';
    } else if (lower.includes('[worker] job finished') || lower.startsWith('failed job:')) {
      runtime.activity = 'idle';
      runtime.currentJob = null;
    } else if (lower.includes('[worker] sending offline heartbeat')) {
      runtime.status = 'stopping';
    }
    this.emitState();
  }

  private appendLog(workerId: string, line: string): void {
    const runtime = this.ensureRuntime(workerId);
    const value = `[${new Date().toLocaleTimeString()}] ${line}`;
    runtime.logs.push(value);
    if (runtime.logs.length > MAX_LOG_LINES) runtime.logs.splice(0, runtime.logs.length - MAX_LOG_LINES);
    this.logListener?.(workerId, value);
  }

  private emitState(): void {
    this.stateListener?.();
  }

  private async sendOfflineHeartbeat(worker: Mt5WorkerDefinition): Promise<void> {
    const connection = this.config.connection;
    const baseUrl = normalizeServerUrl(connection.serverUrl);
    if (!baseUrl || !connection.apiKey) return;
    await requestJson('POST', `${baseUrl}/workers/heartbeat`, {
      worker_instance_id: worker.workerInstanceId,
      worker_name: worker.workerName,
      status: 'offline',
      current_job_id: null,
    }, connection.apiKey);
  }
}

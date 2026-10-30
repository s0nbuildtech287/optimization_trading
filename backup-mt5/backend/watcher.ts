/**
 * MT5 Log Watcher Backend Service
 * Watches MT5 journal/expert log folders and uploads new log content
 * directly to the server DB.
 *
 * Usage: node watcher.js <path-to-terminal-base | config.json>
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import * as chokidar from 'chokidar';
import dotenv from 'dotenv';
import {
  AGENT_API_KEY_HEADER,
  resolveExpertJournalUploadUrl,
} from '../utils/systemMonitorApi';

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

interface WatcherSlotConfig {
  id?: string;
  name: string;
  path: string;
  enabled?: boolean;
}

interface WatcherUploadConfig {
  enabled?: boolean;
  serverUrl?: string;
}

interface WatcherGroupConfig {
  slots: WatcherSlotConfig[];
  upload?: WatcherUploadConfig;
}

// Keep each request bounded so a growing MT5 log cannot create a large
// in-memory delta or monopolize the server connection pool.
const DEFAULT_UPLOAD_CHUNK_BYTES = 1 * 1024 * 1024;
const MAX_READ_DELTA_BYTES = 4 * 1024 * 1024;

const TRADE_ERROR_KEYWORDS = [
  'failed market buy',
  'failed market sell',
  'open order failed',
  'no money',
  'market closed',
  'invalid volume',
  'too big volume',
  'failed buy limit',
  'failed sell limit',
  'failed buy stop',
  'failed sell stop',
  'failed buy stop limit',
  'failed sell stop limit',
  'failed buy market',
  'failed sell market',
];

const ERROR_KEYWORDS = [
  'error',
  'failed',
  'invalid',
  'rejected',
  'denied',
  'timed out',
  'authorization failed',
  'cannot',
  'unable to',
  'lost',
  'no money',
  'market closed',
  'memoryexception',
  'heapmin',
  'failed market buy',
  'failed market sell',
  'bad stops',
  'market close',
];

const WARNING_KEYWORDS = [
  'warning',
  'connection%lost',
  'lost',
  'disconnected',
  'reconnect',
  'requote',
  'scanning network',
  'auto connecting',
  'spread',
  'slippage',
];

function includesKeyword(message: string, keywords: string[]): boolean {
  return keywords.some((keyword) => keyword.split('%').filter(Boolean).every((part) => message.includes(part)));
}

function classifySeverityCode(line: string): number {
  const message = String(line || '').toLowerCase();
  if (includesKeyword(message, TRADE_ERROR_KEYWORDS)) return 3;
  if (includesKeyword(message, ERROR_KEYWORDS)) return 2;
  if (includesKeyword(message, WARNING_KEYWORDS)) return 1;
  return 0;
}

function deriveLogAt(fileName: string, message: string): string | null {
  const fullTimestamp = String(message || '').match(
    /(\d{4})[.\-](\d{2})[.\-](\d{2})[ T]+(\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?)/,
  );
  if (fullTimestamp) {
    return `${fullTimestamp[1]}-${fullTimestamp[2]}-${fullTimestamp[3]} ${fullTimestamp[4]}`;
  }

  const fileDate = String(fileName || '').match(/(?:^|[^0-9])(\d{4})(\d{2})(\d{2})\.log$/i);
  const time = String(message || '').match(/\b(\d{2}:\d{2}:\d{2}\.\d{3})\b/);
  if (!fileDate || !time) return null;
  return `${fileDate[1]}-${fileDate[2]}-${fileDate[3]} ${time[1]}`;
}

function buildClassifiedRecords(
  chunk: string,
  fileName: string,
): Array<{ message: string; severity_code: number; log_at: string | null }> {
  return String(chunk || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((message) => ({
      message,
      severity_code: classifySeverityCode(message),
      log_at: deriveLogAt(fileName, message),
    }));
}

function readTextAnyEncoding(pathName: string): string {
  for (const encoding of ['utf16le', 'utf-8', 'utf-8-sig', 'cp1258', 'latin1']) {
    try {
      return fs.readFileSync(pathName, { encoding: encoding as BufferEncoding });
    } catch {
      // try next encoding
    }
  }
  return '';
}

function getMt5AccountInfo(basePath: string): { accountNumber: string; serverName: string } {
  const iniPath = path.join(basePath, 'config', 'common.ini');
  if (!fs.existsSync(iniPath)) {
    return { accountNumber: '', serverName: '' };
  }

  const content = readTextAnyEncoding(iniPath);
  if (!content) {
    return { accountNumber: '', serverName: '' };
  }

  const loginMatch = content.match(/Login=(\d+)/i);
  const serverMatch = content.match(/Server=(.+)/i);

  return {
    accountNumber: loginMatch?.[1]?.trim() || '',
    serverName: serverMatch?.[1]?.trim() || '',
  };
}

function normalizeServerUrl(serverUrl: string): string {
  const trimmed = String(serverUrl || '').trim();
  if (!trimmed) return trimmed;
  const resolved = resolveExpertJournalUploadUrl(trimmed);
  const u = new URL(resolved);
  if (u.hostname === 'localhost' || u.hostname === '::1' || u.hostname === '[::1]') {
    u.hostname = '127.0.0.1';
  }
  return u.toString();
}

function httpPostJson(
  urlStr: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = 60_000,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname,
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

function splitContentIntoChunks(content: string, maxBytes = DEFAULT_UPLOAD_CHUNK_BYTES): string[] {
  const trimmed = String(content || '');
  if (!trimmed) return [];
  if (Buffer.byteLength(trimmed, 'utf8') <= maxBytes) {
    return [trimmed];
  }

  const lines = trimmed.split(/\r?\n/);
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (current && Buffer.byteLength(candidate, 'utf8') > maxBytes) {
      chunks.push(current);
      current = line;
      continue;
    }
    current = candidate;
  }

  if (current) chunks.push(current);
  return chunks;
}

function normalizeDecodedLogText(text: string): string {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '');
}

function decodeLogBuffer(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return '';

  // MT5 journal/expert logs are written as UTF-16LE with BOM on Windows.
  // If the watcher reads a partial trailing byte while the file is being
  // updated, trim the last byte so we always decode on a 2-byte boundary.
  const alignedBuffer = buffer.length % 2 === 1 ? buffer.subarray(0, buffer.length - 1) : buffer;
  if (alignedBuffer.length === 0) return '';

  return normalizeDecodedLogText(alignedBuffer.toString('utf16le'));
}

function getTodayLogStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return `${lookup.get('year') || '1970'}${lookup.get('month') || '01'}${lookup.get('day') || '01'}`;
}

function getTodayLogFileName(date = new Date()): string {
  return `${getTodayLogStamp(date)}.log`;
}

function shouldIgnoreLogFile(fileName: string): boolean {
  return path.basename(String(fileName || '')).toLowerCase() === 'metaeditor.log';
}

class MT5LogWatcher {
  private basePath: string;
  private journalLogsPath: string;
  private expertsLogsPath: string;
  private debugLogPath: string;
  private offsetStatePath: string;
  private fileOffsets: { journal: Record<string, number>; experts: Record<string, number> };
  private journalWatcher?: chokidar.FSWatcher;
  private expertsWatcher?: chokidar.FSWatcher;
  private journalTodayWatcher?: chokidar.FSWatcher;
  private expertsTodayWatcher?: chokidar.FSWatcher;
  private todayRefreshTimer?: NodeJS.Timeout;
  private currentTodayStamp: string;
  private accountNumber: string;
  private serverName: string;
  private readonly getUploadConfig: () => WatcherUploadConfig | undefined;
  private readonly pollIntervalMs = 1_000;
  private readonly forceBootstrap: boolean;
  private fileProcessingQueue: Promise<void> = Promise.resolve();

  constructor(basePath: string, getUploadConfig: () => WatcherUploadConfig | undefined) {
    this.basePath = basePath;
    this.journalLogsPath = path.join(basePath, 'Logs');
    this.expertsLogsPath = path.join(basePath, 'MQL5', 'Logs');
    this.debugLogPath = path.join(this.basePath, 'watcher-upload.log');
    this.offsetStatePath = path.join(this.basePath, '.mt5-log-watcher-offsets.json');
    this.fileOffsets = this.loadFileOffsets();
    this.currentTodayStamp = getTodayLogStamp();
    this.getUploadConfig = getUploadConfig;
    this.forceBootstrap = String(process.env.MT5_WATCHER_FORCE_BOOTSTRAP || '').trim() === '1';

    const accountInfo = getMt5AccountInfo(basePath);
    this.accountNumber = accountInfo.accountNumber;
    this.serverName = accountInfo.serverName;

    this.ensureDirectories();
    this.logMessage(
      `MT5 Log Watcher initialized for: ${basePath}` +
      (this.accountNumber ? ` (account=${this.accountNumber}${this.serverName ? `, server=${this.serverName}` : ''})` : ''),
    );
    if (!this.accountNumber) {
      this.logMessage(`Account number not found in ${path.join(basePath, 'config', 'common.ini')}`);
    }
    this.logMessage(`Source folders: journal=${this.journalLogsPath}, experts=${this.expertsLogsPath}`);
    this.logMessage(`Persistent debug log: ${this.debugLogPath}`);
    if (this.forceBootstrap) {
      this.logMessage('Bootstrap reset requested for this terminal; first run will re-read all journal/expert files.');
    }
  }

  private logMessage(msg: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}`;
    console.log(line);
    try {
      fs.appendFileSync(this.debugLogPath, `${line}\r\n`, 'utf8');
    } catch {
      // Best effort only; console logging still continues.
    }
  }

  private loadFileOffsets(): { journal: Record<string, number>; experts: Record<string, number> } {
    try {
      if (!fs.existsSync(this.offsetStatePath)) {
        return { journal: {}, experts: {} };
      }
      const parsed = JSON.parse(fs.readFileSync(this.offsetStatePath, 'utf8')) as Partial<{
        journal: Record<string, number>;
        experts: Record<string, number>;
      }>;
      const sanitize = (value: unknown): Record<string, number> => {
        if (!value || typeof value !== 'object') return {};
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, offset]) => Number.isFinite(offset) && Number(offset) >= 0)
            .map(([file, offset]) => [file, Number(offset)]),
        );
      };
      return { journal: sanitize(parsed.journal), experts: sanitize(parsed.experts) };
    } catch (error) {
      this.logMessage(`Failed to load persisted log offsets: ${error}`);
      return { journal: {}, experts: {} };
    }
  }

  private persistFileOffsets(): void {
    const temporaryPath = `${this.offsetStatePath}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(this.fileOffsets), 'utf8');
      fs.renameSync(temporaryPath, this.offsetStatePath);
    } catch (error) {
      this.logMessage(`Failed to persist log offsets: ${error}`);
      try {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      } catch {
        // Best effort cleanup only.
      }
    }
  }

  private ensureDirectories(): void {
    const dirs = [
      this.journalLogsPath,
      this.expertsLogsPath,
    ];
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

  private getSourceDir(fileType: 'journal' | 'experts'): string {
    return fileType === 'journal' ? this.journalLogsPath : this.expertsLogsPath;
  }

  private getFileOffsetMap(fileType: 'journal' | 'experts'): Record<string, number> {
    return fileType === 'journal' ? this.fileOffsets.journal : this.fileOffsets.experts;
  }

  private getTodaySourceFilePath(fileType: 'journal' | 'experts'): string {
    return path.join(this.getSourceDir(fileType), getTodayLogFileName());
  }

  private createTodayFileWatcher(
    filePath: string,
    fileType: 'journal' | 'experts',
  ): chokidar.FSWatcher {
    const watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 500,
      awaitWriteFinish: {
        stabilityThreshold: 250,
        pollInterval: 50,
      },
    });

    watcher
      .on('add', async (addedPath) => {
        await this.enqueueFileProcessing(addedPath, fileType);
      })
      .on('change', async (changedPath) => {
        await this.enqueueFileProcessing(changedPath, fileType);
      })
      .on('error', (err) => {
        this.logMessage(`${fileType} today watcher error: ${err}`);
      });

    this.logMessage(`Watching today's ${fileType} file: ${filePath}`);
    return watcher;
  }

  private refreshTodayWatchers(force = false): void {
    const nextStamp = getTodayLogStamp();
    const stampChanged = nextStamp !== this.currentTodayStamp;
    if (!force && !stampChanged) {
      return;
    }

    if (stampChanged) {
      this.logMessage(`Date changed from ${this.currentTodayStamp} to ${nextStamp}, switching today's file watchers`);
    }

    this.currentTodayStamp = nextStamp;

    this.journalTodayWatcher?.close();
    this.journalTodayWatcher = undefined;
    this.expertsTodayWatcher?.close();
    this.expertsTodayWatcher = undefined;

    const journalTodayPath = this.getTodaySourceFilePath('journal');
    const expertsTodayPath = this.getTodaySourceFilePath('experts');

    this.journalTodayWatcher = this.createTodayFileWatcher(journalTodayPath, 'journal');
    this.expertsTodayWatcher = this.createTodayFileWatcher(expertsTodayPath, 'experts');
  }

  private async uploadFileDelta(
    deltaContent: string,
    fileType: 'journal' | 'experts',
    fileName: string,
    uploadId: string,
  ): Promise<void> {
    const uploadConfig = this.getUploadConfig();
    if (!uploadConfig?.enabled || !uploadConfig.serverUrl?.trim()) {
      this.logMessage(
        `Upload disabled for ${fileName}: enabled=${Boolean(uploadConfig?.enabled)} serverUrl=${uploadConfig?.serverUrl ? 'set' : 'empty'}`,
      );
      return;
    }
    if (!this.accountNumber) {
      this.logMessage(`Upload skipped for ${fileName}: account number not found`);
      return;
    }

    const apiKey = (process.env.SYSTEM_MONITOR_API_KEY || '').trim();
    if (!apiKey) {
      this.logMessage(`Upload skipped for ${fileName}: SYSTEM_MONITOR_API_KEY missing`);
      return;
    }

    const url = normalizeServerUrl(uploadConfig.serverUrl);
    const chunks = splitContentIntoChunks(deltaContent);
    if (chunks.length === 0) {
      this.logMessage(`Upload skipped for ${fileName}: no new content to send`);
      return;
    }

    const uploadType = fileType === 'journal' ? 'journal' : 'expert';
    const totalChunks = chunks.length;
    const preview = String(deltaContent || '').replace(/\r?\n/g, ' | ').slice(0, 240);
    this.logMessage(
      `Uploading ${fileName} as ${uploadType} to ${url} with ${totalChunks} chunk(s), account=${this.accountNumber}`,
    );
    this.logMessage(
      `Upload source data for ${fileName}: ` +
      `fileType=${fileType}, uploadType=${uploadType}, ` +
      `contentBytes=${Buffer.byteLength(deltaContent, 'utf8')}, ` +
      `chunkBytes=${chunks.map((chunk) => Buffer.byteLength(chunk, 'utf8')).join(',')}, ` +
      `preview="${preview}"`,
    );
    const baseHeaders = {
      'Content-Type': 'application/json',
      [AGENT_API_KEY_HEADER]: apiKey,
      'User-Agent': `MT5LogWatcher/${this.accountNumber}`,
    };

    for (let index = 0; index < chunks.length; index++) {
      const payload: Record<string, unknown> = {
        accountNumber: this.accountNumber,
        fileType: uploadType,
        fileName,
        fileContent: chunks[index],
        terminalPath: this.basePath,
        uploadId,
        chunkNumber: index + 1,
        totalChunks,
        records: buildClassifiedRecords(chunks[index], fileName),
      };

      const body = JSON.stringify(payload);
      const chunkBytes = Buffer.byteLength(chunks[index], 'utf8');
      this.logMessage(
        `Payload fields for ${fileName} chunk ${index + 1}/${totalChunks}: ` +
        `${Object.keys(payload).join(', ')}; serverUrl=${url}; chunkBytes=${chunkBytes}; bodyBytes=${Buffer.byteLength(body, 'utf8')}`,
      );
      this.logMessage(
        `Sending chunk ${index + 1}/${totalChunks} for ${fileName} to ${url} (${chunkBytes} bytes)`,
      );
      const response = await httpPostJson(url, baseHeaders, body);
      this.logMessage(
        `Server response for ${fileName} chunk ${index + 1}/${totalChunks}: serverUrl=${url}; HTTP ${response.statusCode}` +
        (response.body ? `; body=${response.body.slice(0, 500)}` : '; body=<empty>'),
      );
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(
          `HTTP ${response.statusCode}: ${response.body ? response.body.slice(0, 160) : 'upload failed'}`,
        );
      }
    }

    this.logMessage(
      `Uploaded ${Buffer.byteLength(deltaContent, 'utf8')} bytes from ${fileName} to server` +
      (totalChunks > 1 ? ` (${totalChunks} chunks)` : ''),
    );
  }

  private async processSourceFile(
    sourceFile: string,
    fileType: 'journal' | 'experts',
  ): Promise<void> {
    try {
      if (shouldIgnoreLogFile(sourceFile)) {
        this.logMessage(`Skipping ignored log file: ${sourceFile}`);
        return;
      }

      const stateKey = path.basename(sourceFile);
      const fileOffsetMap = this.getFileOffsetMap(fileType);

      const stats = fs.statSync(sourceFile);
      const currentSize = stats.size;

      if (fileOffsetMap[stateKey] === undefined) {
        fileOffsetMap[stateKey] = 0;
        this.logMessage(
          this.forceBootstrap
            ? `Bootstrap reading ${stateKey} from start`
            : `First seen ${stateKey}, reading from start`,
        );
      }

      let previousSize = fileOffsetMap[stateKey];
      if (previousSize % 2 === 1) {
        this.logMessage(`Realigning odd file offset for ${stateKey}: ${previousSize} -> ${previousSize - 1}`);
        previousSize -= 1;
        fileOffsetMap[stateKey] = previousSize;
      }

      if (currentSize < previousSize) {
        this.logMessage(`File reset detected for ${stateKey}, reading from start again.`);
        previousSize = 0;
        fileOffsetMap[stateKey] = 0;
      }

      if (currentSize > previousSize) {
        let bytesToRead = Math.min(currentSize - previousSize, MAX_READ_DELTA_BYTES);
        // MT5 logs are UTF-16LE, so always keep the read window on a 2-byte
        // boundary. If the file is mid-write and we catch an odd trailing byte,
        // leave that byte unread so the next poll can re-read it with the next
        // byte and preserve UTF-16LE alignment.
        if (bytesToRead % 2 === 1) {
          bytesToRead -= 1;
        }

        if (bytesToRead <= 0) {
          return;
        }

        const buffer = Buffer.alloc(bytesToRead);
        const fd = fs.openSync(sourceFile, 'r');

        try {
          fs.readSync(fd, buffer, 0, bytesToRead, previousSize);
          const content = decodeLogBuffer(buffer);
          const preview = content.replace(/\r?\n/g, ' | ').slice(0, 240);
          this.logMessage(
            `Read ${bytesToRead} bytes from ${path.basename(sourceFile)} ` +
            `(size ${previousSize} -> ${previousSize + bytesToRead}; offset pending upload ACK)`,
          );
          this.logMessage(
            `Read delta from ${path.basename(sourceFile)}: ` +
            `source=${sourceFile}, fileType=${fileType}, ` +
            `deltaBytes=${Buffer.byteLength(content, 'utf8')}, preview="${preview}"`,
          );

          // Keep upload inside the per-watcher processing queue. This prevents
          // polling from opening overlapping uploads for the same file and
          // lets us advance the offset only after the server acknowledges it.
          const uploadId = [
            this.accountNumber,
            this.basePath,
            fileType,
            path.basename(sourceFile),
            previousSize,
          ].join(':');
          await this.uploadFileDelta(content, fileType, path.basename(sourceFile), uploadId);
          fileOffsetMap[stateKey] = previousSize + bytesToRead;
          this.persistFileOffsets();
          this.logMessage(
            `Upload acknowledged for ${path.basename(sourceFile)}; offset committed at ${fileOffsetMap[stateKey]}`,
          );
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch (err) {
      this.logMessage(`Error processing file ${sourceFile}: ${err}`);
    }
  }

  private enqueueFileProcessing(
    sourceFile: string,
    fileType: 'journal' | 'experts',
  ): Promise<void> {
    this.fileProcessingQueue = this.fileProcessingQueue
      .catch(() => undefined)
      .then(() => this.processSourceFile(sourceFile, fileType));
    return this.fileProcessingQueue;
  }

  private scanDirectoryForFiles(dirPath: string, fileType: 'journal' | 'experts'): void {
    try {
      if (!fs.existsSync(dirPath)) {
        this.logMessage(`Directory does not exist: ${dirPath}`);
        return;
      }

      const files = fs.readdirSync(dirPath);
      this.logMessage(`Initial scan for ${fileType}: ${files.length} item(s) in ${dirPath}`);
      for (const file of files) {
        if (shouldIgnoreLogFile(file)) {
          this.logMessage(`Skipping ignored log file during initial scan: ${path.join(dirPath, file)}`);
          continue;
        }
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
          void this.enqueueFileProcessing(filePath, fileType);
        }
      }
      this.logMessage(`Completed initial scan of ${fileType} files in: ${dirPath}`);
    } catch (err) {
      this.logMessage(`Error scanning directory ${dirPath}: ${err}`);
    }
  }

  private pollDirectoryForFiles(dirPath: string, fileType: 'journal' | 'experts'): void {
    try {
      if (!fs.existsSync(dirPath)) {
        return;
      }

      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        if (shouldIgnoreLogFile(file)) {
          continue;
        }

        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          void this.enqueueFileProcessing(filePath, fileType);
        }
      }
    } catch (err) {
      this.logMessage(`Error polling directory ${dirPath}: ${err}`);
    }
  }

  private setupJournalWatcher(): void {
    this.logMessage(`Preparing journal watcher at ${this.journalLogsPath}`);
    this.logMessage('Journal files will be uploaded directly to the server DB');
    this.scanDirectoryForFiles(this.journalLogsPath, 'journal');
    this.logMessage('Journal initial scan complete; switching to today-only watcher');
    this.logMessage(`Journal today-only refresh interval: ${this.pollIntervalMs}ms`);
    this.logMessage(`Journal watcher started for: ${this.journalLogsPath}`);
  }

  private setupExpertsWatcher(): void {
    this.logMessage(`Preparing experts watcher at ${this.expertsLogsPath}`);
    this.logMessage('Experts files will be uploaded directly to the server DB');
    this.scanDirectoryForFiles(this.expertsLogsPath, 'experts');
    this.logMessage('Experts initial scan complete; switching to today-only watcher');
    this.logMessage(`Experts today-only refresh interval: ${this.pollIntervalMs}ms`);
    this.logMessage(`Experts watcher started for: ${this.expertsLogsPath}`);
  }

  public start(): void {
    this.logMessage('Starting MT5 Log Watcher file monitors');
    if (this.forceBootstrap) {
      this.fileOffsets = { journal: {}, experts: {} };
      this.logMessage('Cleared in-memory file offsets for bootstrap run');
    }
    this.setupJournalWatcher();
    this.setupExpertsWatcher();
    this.refreshTodayWatchers(true);
    this.todayRefreshTimer = setInterval(() => {
      this.refreshTodayWatchers(false);
      this.pollDirectoryForFiles(this.journalLogsPath, 'journal');
      this.pollDirectoryForFiles(this.expertsLogsPath, 'experts');
    }, this.pollIntervalMs);
    this.logMessage(`Today file refresh timer enabled every ${this.pollIntervalMs}ms`);
    this.logMessage('MT5 Log Watcher started successfully');
  }

  public stop(): void {
    this.journalWatcher?.close();
    this.expertsWatcher?.close();
    this.journalTodayWatcher?.close();
    this.expertsTodayWatcher?.close();
    if (this.todayRefreshTimer) {
      clearInterval(this.todayRefreshTimer);
      this.todayRefreshTimer = undefined;
    }
    this.logMessage('MT5 Log Watcher stopped');
  }
}

class MT5LogWatcherGroup {
  private configPath: string;
  private groupLogPath: string;
  private watchers = new Map<string, MT5LogWatcher>();
  private watcherPaths = new Map<string, string>();
  private configWatcher?: chokidar.FSWatcher;
  private currentUploadConfig: WatcherUploadConfig = { enabled: false, serverUrl: '' };

  constructor(configPath: string) {
    this.configPath = configPath;
    this.groupLogPath = path.join(path.dirname(configPath), 'watcher-group.log');
  }

  private loadConfig(): WatcherGroupConfig {
    try {
      const raw = fs.readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw) as any;
      const slotsSource = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.slots)
          ? parsed.slots
          : Array.isArray(parsed?.terminals)
            ? parsed.terminals
            : [];

      const uploadSource = Array.isArray(parsed)
        ? null
        : parsed?.upload || parsed?.serverSync || null;

      return {
        slots: slotsSource
          .map((slot: any) => {
            const rawPath = String(slot?.path || '').trim();
            if (!rawPath) return null;
            return {
              id: String(slot?.id || '').trim() || undefined,
              name: String(slot?.name || '').trim() || path.basename(rawPath) || 'MT5',
              path: sanitizePath(rawPath),
              enabled: slot?.enabled !== false,
            };
          })
          .filter((slot: WatcherSlotConfig | null): slot is WatcherSlotConfig => !!slot && !!slot.path),
        upload: uploadSource
          ? {
              enabled: uploadSource.enabled !== false,
              serverUrl: String(uploadSource.serverUrl || uploadSource.url || '').trim(),
            }
          : { enabled: false, serverUrl: '' },
      };
    } catch (err) {
      this.logMessage(`Failed to load group config: ${err}`);
      return { slots: [], upload: { enabled: false, serverUrl: '' } };
    }
  }

  private getSlotKey(slot: WatcherSlotConfig): string {
    return String(slot.id || slot.path).trim().toLowerCase();
  }

  private logMessage(msg: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [MT5LogWatcherGroup] ${msg}`;
    console.log(line);
    try {
      fs.appendFileSync(this.groupLogPath, `${line}\r\n`, 'utf8');
    } catch {
      // Best effort only; console logging still continues.
    }
  }

  private syncWatchers(): void {
    const config = this.loadConfig();
    this.currentUploadConfig = config.upload || { enabled: false, serverUrl: '' };
    this.logMessage(
      `Config loaded: ${config.slots.length} slot(s), upload=${this.currentUploadConfig.enabled ? 'on' : 'off'}` +
      (this.currentUploadConfig.serverUrl ? `, serverUrl=${this.currentUploadConfig.serverUrl}` : ''),
    );

    const desired = new Map<string, WatcherSlotConfig>();
    for (const slot of config.slots) {
      if (slot.enabled === false) continue;
      desired.set(this.getSlotKey(slot), slot);
    }

    for (const [key, watcher] of this.watchers.entries()) {
      const desiredSlot = desired.get(key);
      const currentPath = this.watcherPaths.get(key);
      if (!desiredSlot || desiredSlot.path !== currentPath) {
        watcher.stop();
        this.watchers.delete(key);
        this.watcherPaths.delete(key);
        this.logMessage(`Stopped watcher: ${currentPath || key}`);
      }
    }

    for (const [key, slot] of desired.entries()) {
      if (this.watchers.has(key)) continue;
      if (!fs.existsSync(slot.path)) {
        this.logMessage(`Skipped missing terminal path: ${slot.path}`);
        continue;
      }

      const watcher = new MT5LogWatcher(slot.path, () => this.currentUploadConfig);
      watcher.start();
      this.watchers.set(key, watcher);
      this.watcherPaths.set(key, slot.path);
      this.logMessage(`Started watcher: ${slot.name} -> ${slot.path}`);
    }

    this.logMessage(
      `Group synced. Active watchers: ${this.watchers.size}` +
      (this.currentUploadConfig.enabled && this.currentUploadConfig.serverUrl
        ? `, upload=${this.currentUploadConfig.serverUrl}`
        : ', upload=off'),
    );
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
      .on('add', () => this.syncWatchers())
      .on('change', () => this.syncWatchers())
      .on('error', (err) => this.logMessage(`Config watcher error: ${err}`));

    this.syncWatchers();
    this.logMessage('MT5 Log Watcher group started successfully');
  }

  public stop(): void {
    this.configWatcher?.close();
    this.configWatcher = undefined;
    for (const watcher of this.watchers.values()) {
      watcher.stop();
    }
    this.watchers.clear();
    this.watcherPaths.clear();
    this.logMessage('MT5 Log Watcher group stopped');
  }
}

function sanitizePath(value: string): string {
  return path.normalize(String(value || '').trim());
}

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: node watcher.js <path-to-terminal-base | config.json>');
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Path does not exist: ${inputPath}`);
  process.exit(1);
}

const isGroupConfig = fs.statSync(inputPath).isFile() && path.extname(inputPath).toLowerCase() === '.json';
console.log(`[${new Date().toISOString()}] Watcher starting with input: ${inputPath} (${isGroupConfig ? 'group config' : 'terminal path'})`);

if (isGroupConfig) {
  const watcherGroup = new MT5LogWatcherGroup(inputPath);
  watcherGroup.start();

  process.on('SIGTERM', () => {
    watcherGroup.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    watcherGroup.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    watcherGroup.stop();
    process.exit(1);
  });
} else {
  const watcher = new MT5LogWatcher(inputPath, () => ({ enabled: false, serverUrl: '' }));
  watcher.start();

  process.on('SIGTERM', () => {
    watcher.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    watcher.stop();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    watcher.stop();
    process.exit(1);
  });
}

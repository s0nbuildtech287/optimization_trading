var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "16.6.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    var fs2 = require("fs");
    var path2 = require("path");
    var os2 = require("os");
    var crypto = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs2.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
      }
      if (fs2.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path2.join(os2.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path2.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path3 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs2.readFileSync(path3, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path3} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (debug || !quiet) {
        const keysCount = Object.keys(parsedAll).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path2.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// backend/eaScanner.ts
var eaScanner_exports = {};
__export(eaScanner_exports, {
  DEFAULT_SCAN_BOT_PATH: () => DEFAULT_SCAN_BOT_PATH,
  resolveScanBotUrl: () => resolveScanBotUrl,
  runEaScannerScan: () => runEaScannerScan,
  runEaScannerSync: () => runEaScannerSync,
  sendBotsToServer: () => sendBotsToServer
});
module.exports = __toCommonJS(eaScanner_exports);
var import_child_process = require("child_process");
var import_crypto = require("crypto");
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var import_dotenv = __toESM(require_main());

// utils/systemMonitorApi.ts
var AGENT_API_KEY_HEADER = "X-Agent-API-Key";

// backend/eaScanner.ts
function loadEnv() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "../../.env")
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      import_dotenv.default.config({ path: envPath });
      return;
    }
  }
  import_dotenv.default.config();
}
loadEnv();
var DEFAULT_SCAN_BOT_PATH = "/api/v1/expert-advisors/sync";
function logMessage(msg) {
  console.error(`[${(/* @__PURE__ */ new Date()).toISOString()}] [EAScanner] ${msg}`);
}
function isQuietWindow(restStart, restEnd, date = /* @__PURE__ */ new Date()) {
  const minute = date.getMinutes();
  if (restStart === restEnd) return minute === restStart;
  if (restStart > restEnd) return minute >= restStart || minute <= restEnd;
  return minute >= restStart && minute <= restEnd;
}
function getBackendDir() {
  if (__dirname.includes("app.asar")) {
    const g = global;
    if (g.process?.resourcesPath) {
      return path.join(g.process.resourcesPath, "backend", "bin");
    }
    return path.join(__dirname, "..", "..", "backend", "bin");
  }
  return path.join(__dirname, "bin");
}
function resolvePython() {
  return os.platform() === "win32" ? "python" : "python3";
}
function generateHardwareBasedId() {
  const interfaces = os.networkInterfaces();
  let primaryMac = "";
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.mac && addr.mac !== "00:00:00:00:00:00") {
        primaryMac = addr.mac;
        break;
      }
    }
    if (primaryMac) break;
  }
  if (!primaryMac) {
    primaryMac = "no-mac-found";
  }
  const hostname2 = os.hostname() || "unknown-host";
  const platformName = os.platform();
  const arch2 = os.arch();
  const cpus2 = os.cpus();
  const cpuModel = cpus2.length > 0 ? cpus2[0].model : "unknown-cpu";
  const hash = (0, import_crypto.createHash)("sha256");
  hash.update(`${primaryMac}|${hostname2}|${platformName}|${arch2}|${cpuModel}`);
  const hexId = hash.digest("hex").slice(0, 16);
  return `MT5-${hexId.slice(0, 4)}-${hexId.slice(4, 8)}-${hexId.slice(8, 12)}-${hexId.slice(12, 16)}`;
}
function getMachineIdCachePath() {
  const homeDir = os.homedir();
  const cacheDir = path.join(homeDir, ".mt5-monitor");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return path.join(cacheDir, "machine-id");
}
function loadOrCreateMachineId(provided) {
  if (provided?.trim()) {
    return provided.trim();
  }
  const cachePath = getMachineIdCachePath();
  try {
    if (fs.existsSync(cachePath)) {
      const cached = fs.readFileSync(cachePath, "utf-8").trim();
      if (cached) {
        return cached;
      }
    }
  } catch {
  }
  const machineId = generateHardwareBasedId();
  try {
    fs.writeFileSync(cachePath, machineId, "utf-8");
  } catch {
  }
  return machineId;
}
function resolveScanBotUrl(serverUrl) {
  const trimmed = serverUrl.trim();
  if (!trimmed) return trimmed;
  const u = new URL(trimmed);
  const normalizedPath = u.pathname.replace(/\/+$/, "");
  if (!u.pathname || u.pathname === "/") {
    u.pathname = DEFAULT_SCAN_BOT_PATH;
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  if (normalizedPath.endsWith(DEFAULT_SCAN_BOT_PATH)) {
    return u.toString();
  }
  if (!u.pathname.includes("scan-bot")) {
    u.pathname = u.pathname.replace(/\/?$/, "") + DEFAULT_SCAN_BOT_PATH;
  }
  return u.toString();
}
function spawnPythonScanner(scanPaths = []) {
  return new Promise((resolve, reject) => {
    const backendDir = getBackendDir();
    const exePath = path.join(backendDir, "ea_scanner.exe");
    const pyPath = path.join(backendDir, "ea_scanner.py");
    const machineId = loadOrCreateMachineId(process.env.EA_SCANNER_MACHINE_ID);
    const hasExe = fs.existsSync(exePath);
    let cmd;
    let args;
    if (hasExe) {
      cmd = exePath;
      args = ["--json", ...scanPaths.flatMap((scanPath) => ["--path", scanPath])];
      logMessage(`Spawning: ${cmd}`);
    } else if (fs.existsSync(pyPath)) {
      cmd = resolvePython();
      args = [pyPath, "--json", ...scanPaths.flatMap((scanPath) => ["--path", scanPath])];
      logMessage(`Spawning: ${cmd} ${args.join(" ")}`);
    } else {
      reject(new Error(`EA scanner script not found in ${backendDir}`));
      return;
    }
    const proc = (0, import_child_process.spawn)(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        EA_SCANNER_MACHINE_ID: machineId
      }
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf-8");
    proc.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `EA scanner exited with code ${code}`));
        return;
      }
      const trimmed = stdout.trim();
      if (!trimmed) {
        reject(new Error("EA scanner returned empty output"));
        return;
      }
      try {
        resolve(JSON.parse(trimmed));
      } catch (err) {
        reject(new Error(`Failed to parse scanner JSON: ${err}. Output: ${trimmed.slice(0, 200)}`));
      }
    });
  });
}
async function runEaScannerScan(scanPaths = []) {
  return spawnPythonScanner(scanPaths);
}
function buildBotSyncPayload(scan) {
  const reports = [
    ...(scan.terminals || []).map((terminal) => ({
      ...terminal,
      status: "ONLINE",
      snapshot_complete: terminal.live_snapshot === true || terminal.realtime_source === "CHR_FALLBACK"
    })),
    ...(scan.offline_terminals || []).map((terminal) => ({
      ...terminal,
      algotrading: null,
      status: "OFFLINE",
      snapshot_complete: true,
      bots: []
    }))
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
    bots: terminal.status === "OFFLINE" ? [] : (scan.bots || []).filter((bot) => bot.terminal_group_key === terminal.group_key || bot.terminal_path === terminal.path).map((bot) => ({
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
      inputs: bot.inputs
    }))
  }));
  return {
    version: 1,
    scan_timestamp: scan.timestamp,
    machine: {
      machine_id: scan.machine_id,
      pc_name: scan.pc_name
    },
    terminals
  };
}
async function sendBotsToServer(serverUrl, scanResult, apiKey) {
  const key = (apiKey || process.env.SYSTEM_MONITOR_API_KEY || "").trim();
  if (!key) {
    throw new Error(`Missing ${AGENT_API_KEY_HEADER} (set SYSTEM_MONITOR_API_KEY in .env)`);
  }
  const url = resolveScanBotUrl(serverUrl);
  if (!Array.isArray(scanResult.bots)) {
    throw new Error("EA scanner result is invalid: bots must be an array");
  }
  const bots = scanResult.bots;
  const payload = buildBotSyncPayload(scanResult);
  const body = JSON.stringify(payload);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `EAScanner/${scanResult.pc_name}`,
      [AGENT_API_KEY_HEADER]: key
    },
    body,
    signal: AbortSignal.timeout(3e4)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${response.statusText}${text ? ` \xE2\u20AC\u201C ${text.slice(0, 160)}` : ""}`);
  }
  return {
    ok: true,
    message: `Sent ${bots.length} bot(s) to ${url}`,
    url,
    count: bots.length
  };
}
async function runEaScannerSync(serverUrl, apiKey, scanPaths = []) {
  const scan = await runEaScannerScan(scanPaths);
  const post = await sendBotsToServer(serverUrl, scan, apiKey);
  return { scan, post };
}
var EAScannerDaemon = class {
  serverUrl;
  intervalSeconds;
  apiKey;
  scanPaths;
  restStart;
  restEnd;
  timer;
  stopped = false;
  isRunning = false;
  constructor(serverUrl, intervalSeconds, apiKey, scanPaths = [], restStart = 55, restEnd = 5) {
    this.serverUrl = resolveScanBotUrl(serverUrl);
    this.intervalSeconds = Math.max(30, intervalSeconds);
    this.apiKey = (apiKey || process.env.SYSTEM_MONITOR_API_KEY || "").trim();
    this.scanPaths = scanPaths;
    this.restStart = Math.max(0, Math.min(59, restStart));
    this.restEnd = Math.max(0, Math.min(59, restEnd));
    logMessage(`Server  : ${this.serverUrl}`);
    logMessage(`Interval: ${this.intervalSeconds}s`);
    logMessage(`Rest    : local :${String(this.restStart).padStart(2, "0")}\xE2\u20AC\u201C:${String(this.restEnd).padStart(2, "0")} each hour (no scan/POST)`);
    if (this.apiKey) {
      logMessage(`Auth    : ${AGENT_API_KEY_HEADER} configured`);
    } else {
      logMessage(`Auth    : WARNING \xE2\u20AC\u201C ${AGENT_API_KEY_HEADER} not set`);
    }
  }
  start() {
    logMessage("Starting EA scanner sync daemon...");
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalSeconds * 1e3);
  }
  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    logMessage("EA scanner sync stopped.");
  }
  async tick() {
    if (this.stopped || this.isRunning) {
      if (this.isRunning) logMessage("Previous sync still in-flight, skipping.");
      return;
    }
    this.isRunning = true;
    try {
      if (isQuietWindow(this.restStart, this.restEnd)) {
        logMessage(`Quiet window (local :${String(this.restStart).padStart(2, "0")}\xE2\u20AC\u201C:${String(this.restEnd).padStart(2, "0")}) \xE2\u20AC\u201C skip scan/POST`);
        return;
      }
      const scan = await runEaScannerScan(this.scanPaths);
      const post = await sendBotsToServer(this.serverUrl, scan, this.apiKey);
      logMessage(
        `\xE2\u0153\u201C Sync OK \xE2\u20AC\u201C terminals=${scan.active_terminal_count} bots=${post.count} missing=${scan.summary.total_missing} errors=${scan.summary.total_errors}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logMessage(`\xE2\u0153\u2014 Sync failed: ${msg}`);
    } finally {
      this.isRunning = false;
    }
  }
};
async function runCli() {
  const [mode, ...rest] = process.argv.slice(2);
  const extractPaths = (values) => values.filter((value) => value !== "--path");
  if (mode === "scan") {
    const result = await runEaScannerScan(extractPaths(rest));
    process.stdout.write(JSON.stringify(result, null, 2));
    return;
  }
  if (mode === "sync") {
    const serverUrl = rest[0];
    if (!serverUrl) {
      console.error("Usage: node eaScanner.js sync <server-url>");
      process.exit(1);
    }
    const { scan, post } = await runEaScannerSync(serverUrl, rest[1], extractPaths(rest.slice(2)));
    console.log(JSON.stringify({ scan, post }, null, 2));
    return;
  }
  if (mode === "daemon") {
    const serverUrl = rest[0];
    const intervalStr = rest[1] || "300";
    if (!serverUrl) {
      console.error("Usage: node eaScanner.js daemon <server-url> <interval-seconds>");
      process.exit(1);
    }
    const interval = parseInt(intervalStr, 10);
    if (isNaN(interval) || interval < 30) {
      console.error("Interval must be at least 30 seconds.");
      process.exit(1);
    }
    const restStart = rest[2] ? parseInt(rest[2], 10) : 55;
    const restEnd = rest[3] ? parseInt(rest[3], 10) : 5;
    if (isNaN(restStart) || restStart < 0 || restStart > 59 || isNaN(restEnd) || restEnd < 0 || restEnd > 59) {
      console.error("rest-start and rest-end must be 0-59.");
      process.exit(1);
    }
    const daemon = new EAScannerDaemon(serverUrl, interval, void 0, extractPaths(rest.slice(4)), restStart, restEnd);
    daemon.start();
    const shutdown = (signal) => {
      console.log(`
${signal} received.`);
      daemon.stop();
      process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    return;
  }
  console.error("Usage:");
  console.error("  node eaScanner.js scan");
  console.error("  node eaScanner.js sync <server-url>");
  console.error("  node eaScanner.js daemon <server-url> <interval-seconds>");
  process.exit(1);
}
if (require.main === module) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_SCAN_BOT_PATH,
  resolveScanBotUrl,
  runEaScannerScan,
  runEaScannerSync,
  sendBotsToServer
});

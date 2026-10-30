var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
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
    var fs3 = require("fs");
    var path3 = require("path");
    var os3 = require("os");
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
            if (fs3.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path3.resolve(process.cwd(), ".env.vault");
      }
      if (fs3.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path3.join(os3.homedir(), envPath.slice(1)) : envPath;
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
      const dotenvPath = path3.resolve(process.cwd(), ".env");
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
      for (const path4 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs3.readFileSync(path4, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path4} ${e.message}`);
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
            const relative = path3.relative(process.cwd(), filePath);
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

// backend/systemMonitor.ts
var import_child_process = require("child_process");
var os2 = __toESM(require("os"));
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));
var import_crypto = require("crypto");
var import_dotenv = __toESM(require_main());

// utils/systemMonitorApi.ts
var fs = __toESM(require("fs"));
var http = __toESM(require("http"));
var https = __toESM(require("https"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var AGENT_API_KEY_HEADER = "X-Agent-API-Key";
var DEFAULT_MONITOR_INGEST_PATH = "/api/v1/system-monitor/ingest";
var DEFAULT_MONITOR_DISCONNECT_PATH = "/api/v1/system-monitor/disconnect";
var MACHINE_ID_STATE_FILE = ".system-monitor-state.json";
var MONITOR_SESSION_FILE = ".system-monitor-session.json";
function getMachineIdStatePath() {
  return path.join(os.tmpdir(), MACHINE_ID_STATE_FILE);
}
function getMonitorSessionPath() {
  return path.join(os.tmpdir(), MONITOR_SESSION_FILE);
}
function writeMonitorSession(machineId2, serverUrl2) {
  try {
    fs.writeFileSync(
      getMonitorSessionPath(),
      JSON.stringify({ machineId: machineId2, serverUrl: serverUrl2, updatedAt: Date.now() }, null, 2)
    );
  } catch {
  }
}
function isPathOnly(value) {
  return !value || !value.startsWith("/");
}
function resolveMonitorIngestUrl(serverUrl2) {
  const trimmed = serverUrl2.trim();
  if (!trimmed) return trimmed;
  const u = new URL(trimmed);
  if (isPathOnly(u.pathname) || u.pathname === "/") {
    u.pathname = DEFAULT_MONITOR_INGEST_PATH;
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  return u.toString();
}
function readMonitorSession() {
  try {
    const sessionPath = getMonitorSessionPath();
    if (!fs.existsSync(sessionPath)) return null;
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    return session.machineId ? session : null;
  } catch {
    return null;
  }
}
function clearMonitorSession() {
  try {
    const sessionPath = getMonitorSessionPath();
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  } catch {
  }
}
function readMonitorMachineId() {
  const session = readMonitorSession();
  if (session?.machineId) return session.machineId;
  try {
    const statePath = getMachineIdStatePath();
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      if (state.machineId) return state.machineId;
    }
  } catch {
  }
  return null;
}
function resolveDisconnectUrl(ingestUrl) {
  const fromEnv = process.env.SYSTEM_MONITOR_DISCONNECT_URL?.trim();
  if (fromEnv) return fromEnv;
  const resolvedIngest = resolveMonitorIngestUrl(ingestUrl);
  const u = new URL(resolvedIngest);
  if (u.pathname.includes("/ingest")) {
    u.pathname = u.pathname.replace(/\/ingest(\/?)$/, "/disconnect$1");
  } else {
    u.pathname = DEFAULT_MONITOR_DISCONNECT_PATH;
  }
  return u.toString();
}
function httpPost(urlStr, headers, body, timeoutMs = 1e4) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    let hostname2 = u.hostname;
    if (hostname2 === "localhost" || hostname2 === "::1" || hostname2 === "[::1]") {
      hostname2 = "127.0.0.1";
    }
    const options = {
      hostname: hostname2,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(body)
      }
    };
    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
async function sendMonitorDisconnect(ingestUrl, apiKey, machineId2) {
  const id = (machineId2 ?? readMonitorMachineId())?.trim();
  if (!id) {
    return { ok: false, message: "No machineId (no active session / state file)" };
  }
  if (!apiKey.trim()) {
    return { ok: false, message: "Missing API key" };
  }
  const url = resolveDisconnectUrl(ingestUrl);
  const bodyStr = JSON.stringify({ machineId: id });
  const headers = {
    "Content-Type": "application/json",
    [AGENT_API_KEY_HEADER]: apiKey.trim(),
    "User-Agent": `SystemMonitor/${id}`
  };
  const res = await httpPost(url, headers, bodyStr);
  if (res.statusCode < 200 || res.statusCode >= 300) {
    return {
      ok: false,
      url,
      machineId: id,
      message: `POST ${url} \u2192 HTTP ${res.statusCode}${res.body ? ` (${res.body.slice(0, 160)})` : ""}`
    };
  }
  let serverMessage = "";
  try {
    const parsed = JSON.parse(res.body);
    if (parsed.message) serverMessage = ` \u2013 ${parsed.message}`;
  } catch {
  }
  clearMonitorSession();
  return {
    ok: true,
    url,
    machineId: id,
    message: `Disconnect OK: ${id} @ ${url}${serverMessage}`
  };
}

// backend/systemMonitor.ts
function loadMonitorEnv() {
  const candidates = [
    path2.join(process.cwd(), ".env"),
    path2.join(__dirname, "..", ".env"),
    path2.join(__dirname, "../../.env")
  ];
  for (const envPath of candidates) {
    if (fs2.existsSync(envPath)) {
      import_dotenv.default.config({ path: envPath });
      return;
    }
  }
  import_dotenv.default.config();
}
loadMonitorEnv();
function logMessage(msg) {
  console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] [SystemMonitor] ${msg}`);
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}
function generateHardwareBasedId() {
  const interfaces = os2.networkInterfaces();
  let primaryMac = "";
  for (const [name, addrs] of Object.entries(interfaces)) {
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
  const hostname2 = os2.hostname() || "unknown-host";
  const platform2 = os2.platform();
  const arch2 = os2.arch();
  const cpus2 = os2.cpus();
  const cpuModel = cpus2.length > 0 ? cpus2[0].model : "unknown-cpu";
  const hash = (0, import_crypto.createHash)("sha256");
  hash.update(`${primaryMac}|${hostname2}|${platform2}|${arch2}|${cpuModel}`);
  const hexId = hash.digest("hex").substring(0, 16);
  return `MT5-${hexId.substring(0, 4)}-${hexId.substring(4, 8)}-${hexId.substring(8, 12)}-${hexId.substring(12, 16)}`;
}
function getMachineIdCachePath() {
  const homeDir = os2.homedir();
  const cacheDir = path2.join(homeDir, ".mt5-monitor");
  if (!fs2.existsSync(cacheDir)) {
    fs2.mkdirSync(cacheDir, { recursive: true });
  }
  return path2.join(cacheDir, "machine-id");
}
function loadOrCreateMachineId(provided) {
  if (provided) {
    return provided;
  }
  const cachePath = getMachineIdCachePath();
  try {
    if (fs2.existsSync(cachePath)) {
      const cached = fs2.readFileSync(cachePath, "utf-8").trim();
      if (cached) {
        logMessage(`Machine ID loaded from cache: ${cachePath}`);
        return cached;
      }
    }
  } catch (err) {
    logMessage(`Warning: Could not read machine ID cache: ${err}`);
  }
  const machineId2 = generateHardwareBasedId();
  try {
    fs2.writeFileSync(cachePath, machineId2, "utf-8");
    logMessage(`Machine ID generated and cached: ${cachePath}`);
  } catch (err) {
    logMessage(`Warning: Could not write machine ID cache: ${err}`);
  }
  return machineId2;
}
function getBackendDir() {
  if (__dirname.includes("app.asar")) {
    const g = global;
    if (g.process && g.process.resourcesPath) {
      return path2.join(g.process.resourcesPath, "backend", "bin");
    }
    return path2.join(__dirname, "..", "..", "backend", "bin");
  }
  return path2.join(__dirname, "bin");
}
function resolvePython() {
  return os2.platform() === "win32" ? "python" : "python3";
}
function isQuietWindow(restStart2, restEnd2, date = /* @__PURE__ */ new Date()) {
  const m = date.getMinutes();
  if (restStart2 === restEnd2) {
    return m === restStart2;
  } else if (restStart2 > restEnd2) {
    return m >= restStart2 || m <= restEnd2;
  } else {
    return m >= restStart2 && m <= restEnd2;
  }
}
var SystemMonitorService = class {
  serverUrl;
  intervalSeconds;
  machineId;
  apiKey;
  pythonScript;
  restStart;
  restEnd;
  pyProc = null;
  lineBuffer = "";
  isSending = false;
  stopped = false;
  restartTimer;
  constructor(serverUrl2, intervalSeconds, restStart2, restEnd2, machineId2, apiKey) {
    this.serverUrl = resolveMonitorIngestUrl(serverUrl2);
    this.intervalSeconds = Math.max(10, intervalSeconds);
    this.restStart = Math.max(0, Math.min(59, restStart2));
    this.restEnd = Math.max(0, Math.min(59, restEnd2));
    this.machineId = loadOrCreateMachineId(machineId2);
    this.apiKey = (apiKey || process.env.SYSTEM_MONITOR_API_KEY || "").trim();
    const backendDir = getBackendDir();
    this.pythonScript = path2.join(backendDir, "system_monitor.py");
    logMessage(`Server  : ${this.serverUrl}`);
    logMessage(`Interval: ${this.intervalSeconds}s`);
    logMessage(`Machine : ${this.machineId}`);
    logMessage(`Script  : ${this.pythonScript}`);
    logMessage(`Rest    : local :${String(this.restStart).padStart(2, "0")}\u2013:${String(this.restEnd).padStart(2, "0")} each hour (no collect/POST)`);
    if (this.apiKey) {
      logMessage(`Auth    : ${AGENT_API_KEY_HEADER} configured`);
    } else {
      logMessage(`Auth    : WARNING \u2013 ${AGENT_API_KEY_HEADER} not set (set SYSTEM_MONITOR_API_KEY in .env)`);
    }
  }
  // ── Lifecycle ─────────────────────────────────────────────────────────
  start() {
    logMessage("Starting Python monitor daemon...");
    this.spawnPython();
  }
  async stop() {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.apiKey) {
      try {
        const result = await sendMonitorDisconnect(this.serverUrl, this.apiKey, this.machineId);
        if (result.ok) {
          logMessage(`\u2713 ${result.message}`);
        } else {
          logMessage(`\u2717 Disconnect: ${result.message}`);
        }
      } catch (err) {
        logMessage(`\u2717 Disconnect: ${err?.message || err}`);
      }
    }
    if (this.pyProc) {
      this.pyProc.kill("SIGTERM");
      this.pyProc = null;
    }
    logMessage("System monitor stopped.");
  }
  // ── Python subprocess ─────────────────────────────────────────────────
  spawnPython() {
    if (this.stopped) return;
    const exePath = path2.join(getBackendDir(), "system_monitor.exe");
    const hasExe = fs2.existsSync(exePath);
    let cmd;
    let args2;
    if (hasExe) {
      cmd = exePath;
      args2 = [
        "--interval",
        String(this.intervalSeconds),
        "--machine-id",
        this.machineId,
        "--rest-start",
        String(this.restStart),
        "--rest-end",
        String(this.restEnd)
      ];
      logMessage(`Spawning standalone executable: ${cmd} ${args2.join(" ")}`);
    } else {
      const python = resolvePython();
      cmd = python;
      args2 = [
        this.pythonScript,
        "--interval",
        String(this.intervalSeconds),
        "--machine-id",
        this.machineId,
        "--rest-start",
        String(this.restStart),
        "--rest-end",
        String(this.restEnd)
      ];
      logMessage(`Spawning python script: ${cmd} ${args2.join(" ")}`);
    }
    const proc = (0, import_child_process.spawn)(cmd, args2, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // Hide CMD window on Windows
      // inherit current env so pip-installed psutil is reachable
      env: { ...process.env }
    });
    this.pyProc = proc;
    this.lineBuffer = "";
    proc.stdout.setEncoding("utf-8");
    proc.stdout.on("data", (chunk) => {
      this.lineBuffer += chunk;
      let nl;
      while ((nl = this.lineBuffer.indexOf("\n")) !== -1) {
        const line = this.lineBuffer.slice(0, nl).trim();
        this.lineBuffer = this.lineBuffer.slice(nl + 1);
        if (line) this.handleJsonLine(line);
      }
    });
    proc.stderr.setEncoding("utf-8");
    proc.stderr.on("data", (chunk) => {
      chunk.trim().split("\n").forEach((l) => l && logMessage(`[py] ${l.trim()}`));
    });
    proc.on("exit", (code, signal) => {
      logMessage(`Process exited (code=${code}, signal=${signal})`);
      this.pyProc = null;
      if (!this.stopped) {
        logMessage("Restarting process in 5 s...");
        this.restartTimer = setTimeout(() => this.spawnPython(), 5e3);
      }
    });
    proc.on("error", (err) => {
      logMessage(`Spawn error: ${err.message}`);
      if (hasExe) {
        logMessage(`Make sure standalone executable ${exePath} is valid.`);
      } else {
        logMessage("Make sure Python is installed and `psutil` is available (pip install psutil).");
      }
    });
  }
  // ── Data handling ─────────────────────────────────────────────────────
  handleJsonLine(line) {
    try {
      const raw = JSON.parse(line);
      this.sendToServer(raw);
    } catch (err) {
      logMessage(`JSON parse error: ${err}  line=${line.slice(0, 80)}`);
    }
  }
  async sendToServer(data) {
    if (isQuietWindow(this.restStart, this.restEnd)) {
      logMessage(`Quiet window (local :${String(this.restStart).padStart(2, "0")}\u2013:${String(this.restEnd).padStart(2, "0")}) \u2013 skip POST`);
      return;
    }
    if (this.isSending) {
      logMessage("Previous send still in-flight, skipping.");
      return;
    }
    this.isSending = true;
    try {
      if (!this.apiKey) {
        throw new Error(
          `Missing ${AGENT_API_KEY_HEADER} (set SYSTEM_MONITOR_API_KEY in .env at project root)`
        );
      }
      const body = JSON.stringify(data);
      const response = await fetch(this.serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `SystemMonitor/${this.machineId}`,
          [AGENT_API_KEY_HEADER]: this.apiKey
        },
        body,
        signal: AbortSignal.timeout(15e3)
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            `HTTP ${response.status}: API key rejected \u2013 check SYSTEM_MONITOR_API_KEY matches server .env`
          );
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      writeMonitorSession(data.machineId, this.serverUrl);
      logMessage(`\u2713 Sent (${formatBytes(body.length)})  cpu=${data.cpu.currentLoad.toFixed(1)}%  mem=${data.memory.usedPercent.toFixed(1)}% temp=${data.cpu.temperature ?? "N/A"}\xB0C`);
    } catch (err) {
      logMessage(`\u2717 Send failed: ${err.message}`);
    } finally {
      this.isSending = false;
    }
  }
};
var args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node systemMonitor.js <server-url> <interval-seconds> [rest-start] [rest-end] [machine-id] [api-key]");
  console.error("Example: node systemMonitor.js http://localhost:3000 30 55 5");
  console.error("  rest-start: Rest period start minute (0-59), default 55");
  console.error("  rest-end: Rest period end minute (0-59), default 5");
  process.exit(1);
}
var [serverUrl, intervalStr, restStartStr, restEndStr, machineId, apiKeyArg] = args;
var interval = parseInt(intervalStr, 10);
var restStart = restStartStr ? parseInt(restStartStr, 10) : 55;
var restEnd = restEndStr ? parseInt(restEndStr, 10) : 5;
if (isNaN(interval) || interval < 1) {
  console.error("Interval must be a positive integer (minimum 1 second, effective minimum 10 s).");
  process.exit(1);
}
if (isNaN(restStart) || restStart < 0 || restStart > 59) {
  console.error("rest-start must be 0-59");
  process.exit(1);
}
if (isNaN(restEnd) || restEnd < 0 || restEnd > 59) {
  console.error("rest-end must be 0-59");
  process.exit(1);
}
try {
  new URL(serverUrl);
} catch {
  console.error("Invalid server URL.");
  process.exit(1);
}
var monitor = new SystemMonitorService(serverUrl, interval, restStart, restEnd, machineId, apiKeyArg);
monitor.start();
async function shutdown(signal) {
  console.log(`
${signal} received.`);
  await monitor.stop();
  process.exit(0);
}
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

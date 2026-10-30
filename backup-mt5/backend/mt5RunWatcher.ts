import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

type Mt5SlotConfig = {
  id?: string;
  name: string;
  path: string;
};

type WatcherConfig = {
  slots: Mt5SlotConfig[];
  intervalSeconds?: number;
  password?: string;
};

type Mt5RunningProcess = {
  pid: number;
  executablePath: string;
  commandLine: string;
  sessionId?: number;
  owner?: string;
};

function logMessage(message: string): void {
  console.log(`[${new Date().toISOString()}] [Mt5RunWatcher] ${message}`);
}

function normalizeWindowsPath(value: string): string {
  return path.normalize(value).replace(/\//g, '\\').toLowerCase().replace(/\\+$/g, '');
}

function sanitizeExePath(value: string): string {
  return String(value || '').trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
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

async function scanRunningProcesses(): Promise<Mt5RunningProcess[]> {
  const psCommand = [
    '$items = Get-CimInstance Win32_Process -Filter "Name=\'terminal64.exe\'" | ForEach-Object {',
    '  $owner = $null;',
    '  try {',
    '    $owner = Invoke-CimMethod -InputObject $_ -MethodName GetOwner -ErrorAction Stop;',
    '  } catch {',
    '    $owner = $null;',
    '  }',
    '  [PSCustomObject]@{',
    '    ProcessId = $_.ProcessId;',
    '    ExecutablePath = $_.ExecutablePath;',
    '    CommandLine = $_.CommandLine;',
    '    SessionId = $_.SessionId;',
    '    Owner = if ($owner -and $owner.User) { if ($owner.Domain) { "$($owner.Domain)\\$($owner.User)" } else { $owner.User } } else { "" };',
    '  }',
    '};',
    'if ($null -eq $items) {',
    '  @() | ConvertTo-Json -Compress',
    '} else {',
    '  $items | ConvertTo-Json -Compress',
    '}',
  ].join(' ');

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
      owner: item.Owner || '',
    }));
}

function processMatchesTerminal(processInfo: Mt5RunningProcess, terminalExePath: string): boolean {
  const normalizedExePath = normalizeWindowsPath(terminalExePath);
  const normalizedTerminalPath = normalizeWindowsPath(path.dirname(terminalExePath));
  const executablePath = normalizeWindowsPath(processInfo.executablePath || '');
  const commandLine = normalizeWindowsPath(processInfo.commandLine || '');

  return (
    executablePath === normalizedExePath ||
    executablePath.startsWith(normalizedTerminalPath) ||
    commandLine.includes(normalizedExePath) ||
    commandLine.includes(normalizedTerminalPath)
  );
}

function loadConfig(configPath: string): WatcherConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as WatcherConfig;
  return {
    slots: Array.isArray(parsed.slots)
      ? parsed.slots.map((slot) => ({
        ...slot,
        path: sanitizeExePath(slot?.path || ''),
      }))
      : [],
    intervalSeconds: typeof parsed.intervalSeconds === 'number' && parsed.intervalSeconds > 0 ? parsed.intervalSeconds : 10,
    password: typeof parsed.password === 'string' ? parsed.password : '',
  };
}

function getOwnerOrTargetUser(processes: Mt5RunningProcess[], exePath: string): string {
  const matched = processes.find((proc) => processMatchesTerminal(proc, exePath));
  return (matched?.owner || getTargetUserFromExePath(exePath) || '').trim();
}

function expandRunAsAccount(userName: string): string {
  const user = String(userName || '').trim();
  if (!user) return '';
  if (user.includes('\\')) return user;
  const machine = (process.env.COMPUTERNAME || os.hostname() || '').trim();
  return machine ? `${machine}\\${user}` : user;
}

type PathProbeResult = {
  status: 'exists' | 'access_denied' | 'not_found' | 'error';
  message: string;
};

async function probeLiteralPath(exePath: string): Promise<PathProbeResult> {
  const normalizedPath = sanitizeExePath(exePath);
  const escapedPath = normalizedPath.replace(/'/g, "''");
  const psCommand = [
    'try {',
    `  if (Test-Path -LiteralPath '${escapedPath}') {`,
    '    Write-Output "EXISTS";',
    '  } else {',
    '    Write-Output "NOT_FOUND";',
    '  }',
    '} catch [System.UnauthorizedAccessException] {',
    '  Write-Output "ACCESS_DENIED";',
    '} catch {',
    '  if ($_.Exception -and $_.Exception.Message -match "Access is denied") {',
    '    Write-Output "ACCESS_DENIED";',
    '  } else {',
    '    Write-Output ("ERROR:" + $_.Exception.Message);',
    '  }',
    '}',
  ].join(' ');

  try {
    const output = (await runPowerShell(psCommand)).trim();
    if (output === 'EXISTS') {
      return { status: 'exists', message: 'exists' };
    }
    if (output === 'ACCESS_DENIED') {
      return { status: 'access_denied', message: 'access denied' };
    }
    if (output === 'NOT_FOUND') {
      return { status: 'not_found', message: 'not found' };
    }
    if (output.startsWith('ERROR:')) {
      return { status: 'error', message: output.slice(6).trim() || 'probe error' };
    }
    return { status: 'error', message: output || 'probe returned no output' };
  } catch (error: any) {
    return { status: 'error', message: error?.message || String(error) };
  }
}

function getCurrentUserName(): string {
  return (os.userInfo().username || '').toLowerCase();
}

function getTargetUserFromExePath(exePath: string): string {
  const normalized = normalizeWindowsPath(exePath);
  const parts = normalized.split('\\').filter(Boolean);
  const usersIndex = parts.findIndex((part) => part === 'users');
  if (usersIndex >= 0 && parts[usersIndex + 1]) {
    return parts[usersIndex + 1];
  }
  return '';
}

function createTaskName(exePath: string): string {
  const hash = createHash('sha1').update(normalizeWindowsPath(exePath)).digest('hex').slice(0, 16);
  return `mt5-auto-restart-${hash}`;
}

function isSchTasksSessionOrPermissionError(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('access is denied') ||
    lower.includes('logon failure') ||
    lower.includes('password') ||
    lower.includes('session') ||
    lower.includes('/it switch cannot be used') ||
    lower.includes('cannot be used') ||
    lower.includes('the user name or password is incorrect')
  );
}

function spawnAndWait(command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      resolve({ code: -1, stdout, stderr: stderr || error.message });
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function isUserLoggedOn(userName: string): Promise<boolean> {
  const user = expandRunAsAccount(userName);
  if (!user) return false;
  try {
    const result = await spawnAndWait('cmd.exe', ['/c', 'query', 'user']);
    if (result.code !== 0 && !result.stdout) return false;
    const lower = `${result.stdout}\n${result.stderr}`.toLowerCase();
    const short = user.split('\\').pop()?.toLowerCase() || '';
    return lower.includes(user.toLowerCase()) || (!!short && lower.includes(short));
  } catch {
    return false;
  }
}

async function startTerminalDirect(exePath: string): Promise<{ success: boolean; message: string }> {
  try {
    exePath = sanitizeExePath(exePath);
    const probe = await probeLiteralPath(exePath);
    logMessage(`Probe direct: user=${getCurrentUserName()} cwd=${process.cwd()} exe=${JSON.stringify(exePath)} status=${probe.status}`);
    if (probe.status !== 'exists') {
      return { success: false, message: `${probe.status === 'access_denied' ? 'Access denied' : 'Path not found'}: ${JSON.stringify(exePath)}${probe.status === 'error' ? ` :: ${probe.message}` : ''}` };
    }

    const child = spawn(exePath, ['/portable'], {
      cwd: path.dirname(exePath),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });

    child.once('error', (error) => {
      logMessage(`Direct start error: ${error.message}`);
    });
    child.unref();

    return { success: true, message: `Started ${path.basename(path.dirname(exePath))}` };
  } catch (error: any) {
    return { success: false, message: `Failed to start: ${error?.message || error}` };
  }
}

async function startTerminalInUserSession(exePath: string, targetUser: string, password: string): Promise<{ success: boolean; message: string }> {
  exePath = sanitizeExePath(exePath);
  const probe = await probeLiteralPath(exePath);
  logMessage(`Probe session: currentUser=${getCurrentUserName()} targetUser=${targetUser} cwd=${process.cwd()} exe=${JSON.stringify(exePath)} status=${probe.status}`);
  if (probe.status !== 'exists') {
    return { success: false, message: `${probe.status === 'access_denied' ? 'Access denied' : 'Path not found'}: ${JSON.stringify(exePath)}${probe.status === 'error' ? ` :: ${probe.message}` : ''}` };
  }

  const taskName = createTaskName(exePath);
  const taskRun = `"${exePath}" /portable`;
  const now = new Date(Date.now() + 60_000);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const sd = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;

  const runAsUser = expandRunAsAccount(targetUser);
  const loggedOn = await isUserLoggedOn(runAsUser);
  if (!loggedOn) {
    return { success: false, message: `Target user not logged on: ${runAsUser}` };
  }

  const createArgs = [
    '/Create',
    '/TN', taskName,
    '/TR', taskRun,
    '/SC', 'ONCE',
    '/ST', `${hh}:${mm}`,
    '/SD', sd,
    '/RU', runAsUser,
    '/RP', password,
    '/IT',
    '/RL', 'HIGHEST',
    '/F',
  ];

  let lastErrorText = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    const createResult = await spawnAndWait('schtasks', createArgs);
    const createOutput = `${createResult.stdout}\n${createResult.stderr}`.trim();
    if (createResult.code !== 0) {
      lastErrorText = createOutput || String(createResult.code);
      if (attempt < 2 && isSchTasksSessionOrPermissionError(lastErrorText)) {
        logMessage(`schtasks create failed for ${runAsUser} (attempt ${attempt}/2), retrying once: ${lastErrorText}`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      return { success: false, message: `schtasks create failed for ${runAsUser}: ${lastErrorText}` };
    }

    const runResult = await spawnAndWait('schtasks', ['/Run', '/TN', taskName]);
    const runOutput = `${runResult.stdout}\n${runResult.stderr}`.trim();
    if (runResult.code !== 0) {
      lastErrorText = runOutput || String(runResult.code);
      if (attempt < 2 && isSchTasksSessionOrPermissionError(lastErrorText)) {
        logMessage(`schtasks run failed for ${runAsUser} (attempt ${attempt}/2), retrying once: ${lastErrorText}`);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      return { success: false, message: `schtasks run failed for ${runAsUser}: ${lastErrorText}` };
    }

    break;
  }

  await new Promise((resolve) => setTimeout(resolve, 2500));
  const processes = await scanRunningProcesses();
  const running = processes.find((proc) => processMatchesTerminal(proc, exePath));
  if (!running) {
    return { success: false, message: `Task triggered but MT5 did not appear in session of ${runAsUser}` };
  }

  return { success: true, message: `Started ${path.basename(path.dirname(exePath))} in ${runAsUser} session (PID ${running.pid})` };
}

async function startTerminal(exePath: string, password = ''): Promise<{ success: boolean; message: string }> {
  exePath = sanitizeExePath(exePath);
  const currentProcesses = await scanRunningProcesses();
  const targetUser = getOwnerOrTargetUser(currentProcesses, exePath);
  const currentUser = getCurrentUserName();

  if (targetUser && targetUser !== currentUser) {
    return startTerminalInUserSession(exePath, targetUser, password);
  }

  return startTerminalDirect(exePath);
}

async function ensureSlotsRunning(configPath: string): Promise<void> {
  const config = loadConfig(configPath);
  const slots = config.slots.filter((slot) => String(slot?.path || '').trim());
  const processes = await scanRunningProcesses();

  logMessage(`Scan ${slots.length} slot(s); found ${processes.length} terminal64.exe process(es).`);

  for (const slot of slots) {
    const exePath = sanitizeExePath(String(slot.path || '').trim());
    const running = processes.find((proc) => processMatchesTerminal(proc, exePath));

    if (running) {
      const ownerText = running.owner ? `, owner=${running.owner}` : '';
      const sessionText = running.sessionId !== undefined ? `, session=${running.sessionId}` : '';
      logMessage(`Running: ${slot.name || path.basename(path.dirname(exePath))} (PID ${running.pid}${ownerText}${sessionText})`);
      continue;
    }

    logMessage(`Missing: ${slot.name || path.basename(path.dirname(exePath))} -> starting`);
    const result = await startTerminal(exePath, config.password || '');
    if (result.success) {
      const targetUser = getTargetUserFromExePath(exePath);
      const userLabel = targetUser || 'current-user';
      logMessage(`Started in ${userLabel} session: ${slot.name || path.basename(path.dirname(exePath))}`);
    } else {
      logMessage(`Start failed: ${slot.name || path.basename(path.dirname(exePath))} :: ${result.message}`);
    }
  }
}

async function main(): Promise<void> {
  const configPath = process.argv[2];
  const intervalSeconds = Math.max(10, Number.parseInt(process.argv[3] || '10', 10) || 10);

  if (!configPath) {
    throw new Error('Missing config file path');
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  logMessage(`Config : ${configPath}`);
  logMessage(`Interval: ${intervalSeconds}s`);
  logMessage(`Process started, keeping MT5 slots alive...`);

  const tick = async () => {
    try {
      await ensureSlotsRunning(configPath);
    } catch (error: any) {
      logMessage(`Tick error: ${error?.message || error}`);
    }
  };

  await tick();
  setInterval(() => {
    void tick();
  }, intervalSeconds * 1000);
}

void main().catch((error: any) => {
  logMessage(`Fatal error: ${error?.message || error}`);
  process.exit(1);
});

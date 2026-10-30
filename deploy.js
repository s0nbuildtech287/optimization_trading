#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = __dirname;
const FRONTEND_DIR = path.join(ROOT, 'front-end');
const DOMAIN = 'https://backtestt.id.vn';
const SSH_HOST = 'root@103.249.117.229';
const SSH_PORT = '19817';
const REMOTE_BACKEND = '/opt/trading-system/backend';
const REMOTE_FRONTEND_ROOT = '/var/www/trading-system';
const PM2_APP = 'trading-backend';

const args = new Set(process.argv.slice(2));
const deployFrontend = !args.has('--backend-only');
const deployBackend = !args.has('--frontend-only');

if (args.has('--help')) {
  console.log(`Usage: node deploy.js [--frontend-only | --backend-only]\n\nDefault: deploy both backend and frontend.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-deploy-'));
const frontendArchive = path.join(tempDir, `frontend-${stamp}.tgz`);
const backendArchive = path.join(tempDir, `backend-${stamp}.tgz`);

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: options.input ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input: options.input,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status}`);
  }
}

function ssh(script) {
  run('ssh', ['-p', SSH_PORT, '-o', 'BatchMode=yes', SSH_HOST, 'bash', '-s'], { input: script });
}

async function verify() {
  const checks = [
    `${DOMAIN}/`,
    `${DOMAIN}/api/mt5-queue/health`
  ];
  for (const url of checks) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Health check failed: ${url} -> ${response.status}`);
    console.log(`OK ${response.status}: ${url}`);
  }
}

async function main() {
  console.log(`Deploy target: ${DOMAIN}`);
  console.log(`Mode: ${deployBackend && deployFrontend ? 'backend + frontend' : deployBackend ? 'backend only' : 'frontend only'}`);

  // Fail early if SSH key authentication is unavailable.
  run('ssh', ['-p', SSH_PORT, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', SSH_HOST, 'true']);

  if (deployFrontend) {
    run('npm.cmd', ['run', 'build'], {
      cwd: FRONTEND_DIR,
      env: { ...process.env, VITE_API_BASE_URL: DOMAIN }
    });
    run('tar', ['-czf', frontendArchive, '-C', FRONTEND_DIR, 'dist']);
  }

  if (deployBackend) {
    run('tar', [
      '-czf', backendArchive,
      '--exclude=backend/node_modules',
      '--exclude=backend/.env',
      '--exclude=backend/uploads',
      '--exclude=backend/upload',
      '--exclude=backend/logs',
      '--exclude=backend/*.log',
      '--exclude=backend/.git',
      '-C', ROOT,
      'backend'
    ]);
  }

  if (deployFrontend) {
    run('scp', ['-P', SSH_PORT, '-o', 'BatchMode=yes', frontendArchive, `${SSH_HOST}:/root/trading-frontend-deploy.tgz`]);
  }
  if (deployBackend) {
    run('scp', ['-P', SSH_PORT, '-o', 'BatchMode=yes', backendArchive, `${SSH_HOST}:/root/trading-backend-deploy.tgz`]);
  }

  const remoteScript = `
set -Eeuo pipefail

BACKEND_CHANGED=${deployBackend ? '1' : '0'}
FRONTEND_CHANGED=${deployFrontend ? '1' : '0'}
REMOTE_BACKEND='${REMOTE_BACKEND}'
REMOTE_FRONTEND_ROOT='${REMOTE_FRONTEND_ROOT}'
PM2_APP='${PM2_APP}'
STAMP='${stamp}'

cleanup() {
  rm -f /root/trading-backend-deploy.tgz /root/trading-frontend-deploy.tgz
  rm -rf -- "/opt/trading-system/.deploy-$STAMP"
}
trap cleanup EXIT

if [ "$BACKEND_CHANGED" = '1' ]; then
  STAGE="/opt/trading-system/.deploy-$STAMP"
  mkdir -p "$STAGE"
  tar -xzf /root/trading-backend-deploy.tgz -C "$STAGE"
  test -f "$STAGE/backend/package.json"
  test -f "$REMOTE_BACKEND/.env"

  cp "$REMOTE_BACKEND/.env" "$STAGE/backend/.env"
  if [ -d "$REMOTE_BACKEND/src/config/serviceAccounts" ]; then
    mkdir -p "$STAGE/backend/src/config/serviceAccounts"
    cp -a "$REMOTE_BACKEND/src/config/serviceAccounts/." "$STAGE/backend/src/config/serviceAccounts/"
  fi

  chown -R trading:trading "$STAGE/backend"
  runuser -u trading -- env HOME=/home/trading PUPPETEER_SKIP_DOWNLOAD=true npm --prefix "$STAGE/backend" ci --omit=dev

  runuser -u trading -- env HOME=/home/trading pm2 stop "$PM2_APP"
  PREVIOUS='/opt/trading-system/backend.previous'
  test "$(readlink -f "$REMOTE_BACKEND")" = '/opt/trading-system/backend'
  rm -rf -- "$PREVIOUS"
  mv "$REMOTE_BACKEND" "$PREVIOUS"
  mv "$STAGE/backend" "$REMOTE_BACKEND"

  if [ -d "$PREVIOUS/uploads" ]; then mv "$PREVIOUS/uploads" "$REMOTE_BACKEND/uploads"; fi
  if [ -d "$PREVIOUS/upload" ]; then mv "$PREVIOUS/upload" "$REMOTE_BACKEND/upload"; fi
  chown -R trading:trading "$REMOTE_BACKEND"

  runuser -u trading -- env HOME=/home/trading pm2 restart "$PM2_APP" --update-env
  runuser -u trading -- env HOME=/home/trading pm2 save
  sleep 4
  curl --fail --silent --show-error http://127.0.0.1:5000/api/mt5-queue/health >/dev/null
fi

if [ "$FRONTEND_CHANGED" = '1' ]; then
  FRONTEND_STAGE="/var/www/trading-system/.dist-$STAMP"
  mkdir -p "$FRONTEND_STAGE"
  tar -xzf /root/trading-frontend-deploy.tgz -C "$FRONTEND_STAGE"
  test -f "$FRONTEND_STAGE/dist/index.html"
  TARGET="$REMOTE_FRONTEND_ROOT/dist"
  test "$(readlink -f "$TARGET")" = '/var/www/trading-system/dist'
  rm -rf -- "$TARGET"
  mv "$FRONTEND_STAGE/dist" "$TARGET"
  rmdir "$FRONTEND_STAGE"
  chown -R root:www-data "$TARGET"
  find "$TARGET" -type d -exec chmod 755 {} \\\;
  find "$TARGET" -type f -exec chmod 644 {} \\\;
fi

nginx -t
systemctl reload nginx
`;

  ssh(remoteScript);
  await verify();
  console.log(`\nDeployment completed: ${DOMAIN}`);
}

main()
  .catch((error) => {
    console.error(`\nDEPLOY FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });


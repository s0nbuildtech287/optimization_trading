/**
 * Build backend scripts with esbuild
 * Bundles all dependencies into standalone Node.js scripts for PM2
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function buildBackend() {
  console.log('🔨 Building backend scripts...');

  // Build watcher.js
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../backend/watcher.ts')],
    bundle: true,
    platform: 'node',
    target: 'node16',
    outfile: path.join(__dirname, '../backend/watcher.js'),
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external: [], // Bundle everything
  });
  console.log('✅ Built watcher.js');

  // Build folderBackup.js
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../backend/folderBackup.ts')],
    bundle: true,
    platform: 'node',
    target: 'node16',
    outfile: path.join(__dirname, '../backend/folderBackup.js'),
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external: [], // Bundle everything
  });
  console.log('✅ Built folderBackup.js');

  // Build systemMonitor.js (Node.js side – spawns system_monitor.py from backend/bin)
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../backend/systemMonitor.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18', // Need Node 18+ for native fetch + AbortSignal.timeout
    outfile: path.join(__dirname, '../backend/systemMonitor.js'),
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external: [],
  });
  console.log('✅ Built systemMonitor.js');

  // Build eaScanner.js (Node.js side – spawns ea_scanner.exe/.py from backend/bin)
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../backend/eaScanner.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    outfile: path.join(__dirname, '../backend/eaScanner.js'),
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external: [],
  });
  console.log('✅ Built eaScanner.js');

  // Build mt5RunWatcher.js
  await esbuild.build({
    entryPoints: [path.join(__dirname, '../backend/mt5RunWatcher.ts')],
    bundle: true,
    platform: 'node',
    target: 'node16',
    outfile: path.join(__dirname, '../backend/mt5RunWatcher.js'),
    format: 'cjs',
    sourcemap: false,
    minify: false,
    external: [],
  });
  console.log('✅ Built mt5RunWatcher.js');

  // system_monitor.py must be available under backend/bin at runtime.
  // The executable build step places it there, so we only verify the file exists.
  const pySrc = path.join(__dirname, '../backend/bin/system_monitor.py');
  if (fs.existsSync(pySrc)) {
    console.log('✅ system_monitor.py is present in backend/bin');
  } else {
    console.warn('⚠️  system_monitor.py not found – monitor will fail at runtime');
  }

  const eaExeSrc = path.join(__dirname, '../backend/bin/ea_scanner.exe');
  const eaPySrc = path.join(__dirname, '../backend/bin/ea_scanner.py');
  if (fs.existsSync(eaExeSrc)) {
    console.log('✅ ea_scanner.exe is present in backend/bin');
  } else if (fs.existsSync(eaPySrc)) {
    console.warn('⚠️  ea_scanner.exe not found – falling back to ea_scanner.py at runtime');
  } else {
    console.warn('⚠️  ea_scanner.py not found – EA scanner will fail at runtime');
  }

  console.log('✅ Backend build complete');
}

buildBackend().catch((err) => {
  console.error('❌ Backend build failed:', err);
  process.exit(1);
});

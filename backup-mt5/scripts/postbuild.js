/**
 * Post-build script to flatten dist/main structure
 * Copies files from nested directories to top level
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../dist/main/src/main');
const preloadDir = path.join(__dirname, '../dist/main/src/preload');
const rendererSrcDir = path.join(__dirname, '../src/renderer');
const rendererDistDir = path.join(__dirname, '../dist/renderer');
const mainDir = path.join(__dirname, '../dist/main');

// Ensure renderer dist directory exists
if (!fs.existsSync(rendererDistDir)) {
  fs.mkdirSync(rendererDistDir, { recursive: true });
}

// Copy main.js files to top level
if (fs.existsSync(path.join(srcDir, 'main.js'))) {
  fs.copyFileSync(path.join(srcDir, 'main.js'), path.join(mainDir, 'main.js'));
  console.log('✓ Copied main.js to dist/main/');
}

if (fs.existsSync(path.join(srcDir, 'main.d.ts'))) {
  fs.copyFileSync(path.join(srcDir, 'main.d.ts'), path.join(mainDir, 'main.d.ts'));
  console.log('✓ Copied main.d.ts to dist/main/');
}

for (const filename of ['mt5WorkerManager.js', 'mt5WorkerManager.js.map', 'mt5WorkerManager.d.ts', 'mt5WorkerManager.d.ts.map']) {
  const source = path.join(srcDir, filename);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(mainDir, filename));
  }
}

if (fs.existsSync(path.join(preloadDir, 'preload.js'))) {
  fs.copyFileSync(path.join(preloadDir, 'preload.js'), path.join(mainDir, 'preload.js'));
  console.log('✓ Copied preload.js to dist/main/');
}

if (fs.existsSync(path.join(preloadDir, 'preload.d.ts'))) {
  fs.copyFileSync(path.join(preloadDir, 'preload.d.ts'), path.join(mainDir, 'preload.d.ts'));
  console.log('✓ Copied preload.d.ts to dist/main/');
}

// Copy renderer HTML and CSS files
if (fs.existsSync(path.join(rendererSrcDir, 'index.html'))) {
  fs.copyFileSync(path.join(rendererSrcDir, 'index.html'), path.join(rendererDistDir, 'index.html'));
  console.log('✓ Copied index.html to dist/renderer/');
}

if (fs.existsSync(path.join(rendererSrcDir, 'styles.css'))) {
  fs.copyFileSync(path.join(rendererSrcDir, 'styles.css'), path.join(rendererDistDir, 'styles.css'));
  console.log('✓ Copied styles.css to dist/renderer/');
}

// utils are emitted by tsc directly into dist/main/utils
const distUtilsDir = path.join(__dirname, '../dist/main/utils');
if (!fs.existsSync(distUtilsDir)) {
  fs.mkdirSync(distUtilsDir, { recursive: true });
}

// Fix module path in main.js for packaged app
const mainJsPath = path.join(__dirname, '../dist/main/main.js');
if (fs.existsSync(mainJsPath)) {
  let content = fs.readFileSync(mainJsPath, 'utf8');
  // Replace require paths for utils
  content = content.replace(/require\("\.\.\/\.\.\/utils\/pm2Utils"\)/g, 'require("./utils/pm2Utils")');
  content = content.replace(/require\("\.\.\/\.\.\/utils\/pathUtils"\)/g, 'require("./utils/pathUtils")');
  content = content.replace(/require\("\.\.\/\.\.\/utils\/systemMonitorApi"\)/g, 'require("./utils/systemMonitorApi")');
  fs.writeFileSync(mainJsPath, content, 'utf8');
  console.log('✓ Fixed module paths in dist/main/main.js');
}

console.log('✅ Post-build complete');

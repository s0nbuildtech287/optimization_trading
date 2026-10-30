/**
 * Verify that backend scripts are properly bundled
 * Run this after build:backend to ensure no external dependencies remain
 */

const fs = require('fs');
const path = require('path');

const scriptsToCheck = [
  { path: './backend/watcher.js', name: 'watcher.js' },
  { path: './backend/folderBackup.js', name: 'folderBackup.js' },
];

console.log('🔍 Verifying backend bundle...\n');

let allGood = true;

for (const script of scriptsToCheck) {
  const fullPath = path.join(__dirname, '..', script.path);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${script.name} not found at ${fullPath}`);
    allGood = false;
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const stats = fs.statSync(fullPath);
  const sizeKB = (stats.size / 1024).toFixed(2);

  console.log(`📄 ${script.name}:`);
  console.log(`   Size: ${sizeKB} KB`);

  // Check for problematic require statements
  const problematicRequires = [
    'require("chokidar")',
    "require('chokidar')",
    'require("fs-extra")',
    "require('fs-extra')",
    'require("glob")',
    "require('glob')",
  ];

  const foundRequires = [];
  for (const req of problematicRequires) {
    if (content.includes(req)) {
      foundRequires.push(req);
    }
  }

  if (foundRequires.length > 0) {
    console.log(`   ❌ Found unbundled requires:`);
    foundRequires.forEach(req => console.log(`      - ${req}`));
    allGood = false;
  } else {
    console.log(`   ✅ No external requires found`);
  }

  // Check size - bundled files should be reasonably large
  if (stats.size < 50000) { // Less than 50KB is suspicious
    console.log(`   ⚠️  File size is suspiciously small - may not be bundled`);
    allGood = false;
  } else {
    console.log(`   ✅ File size looks good`);
  }

  console.log('');
}

if (allGood) {
  console.log('✅ All backend scripts are properly bundled!\n');
  process.exit(0);
} else {
  console.log('❌ Some issues found. Please check the build process.\n');
  console.log('Make sure to run: npm run build:backend\n');
  process.exit(1);
}
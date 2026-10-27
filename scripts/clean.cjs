const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const isAll = process.argv.includes('--all') || process.argv.includes('--uninstall') || process.argv.includes('--purge');

// Items to remove for standard clean (build outputs & temp files)
const buildItems = [
  'dist',
  'lol-draft-bridge.exe',
  'LoLDraftBridge.exe',
  'tsconfig.tsbuildinfo',
  'logs',
  '*.log'
];

// Additional items to remove if cleaning installation (--all / --uninstall)
const installItems = [
  'node_modules',
  'package-lock.json'
];

const targetsToRemove = isAll ? [...buildItems, ...installItems] : buildItems;

console.log(isAll 
  ? '\x1b[33m[Clean]\x1b[0m Full clean and uninstall in progress...' 
  : '\x1b[36m[Clean]\x1b[0m Cleaning build artifacts...'
);

let removedCount = 0;

for (const item of targetsToRemove) {
  if (item.includes('*')) {
    // Glob-like pattern in rootDir
    const ext = item.replace('*', '');
    try {
      const files = fs.readdirSync(rootDir);
      for (const file of files) {
        if (file.endsWith(ext)) {
          const filePath = path.join(rootDir, file);
          fs.rmSync(filePath, { force: true });
          console.log(`  \x1b[32m✔\x1b[0m Removed file: ${file}`);
          removedCount++;
        }
      }
    } catch {}
    continue;
  }

  const fullPath = path.join(rootDir, item);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`  \x1b[32m✔\x1b[0m Removed: ${item}`);
      removedCount++;
    } catch (err) {
      console.warn(`  \x1b[31m✖\x1b[0m Failed to remove ${item}:`, err.message);
    }
  }
}

if (removedCount === 0) {
  console.log('  \x1b[90m(No files or directories to clean found)\x1b[0m');
}

console.log(isAll 
  ? '\x1b[32m[Clean]\x1b[0m Installation removed successfully. To reinstall run: \x1b[1mnpm install && npm run build\x1b[0m\n'
  : '\x1b[32m[Clean]\x1b[0m Clean completed successfully.\n'
);

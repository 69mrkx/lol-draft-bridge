const fs = require('fs');
const path = require('path');

const exeName = process.platform === 'win32' ? 'lol-draft-bridge.exe' : 'lol-draft-bridge';
const targetPath = path.join(process.cwd(), exeName);

if (!fs.existsSync(targetPath)) {
  try {
    // Try hardlink first (fast, 0 extra disk space)
    fs.linkSync(process.execPath, targetPath);
  } catch (err) {
    try {
      // Fallback to copy if on different drives/filesystems
      fs.copyFileSync(process.execPath, targetPath);
    } catch (copyErr) {
      // Ignore if unable to create (will fallback to standard node executable)
    }
  }
}

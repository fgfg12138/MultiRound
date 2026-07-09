// Wrapper that spawns electron with a clean environment
// Clears ELECTRON_RUN_AS_NODE so Electron runs as GUI, not Node.js

const { spawn } = require('child_process');
const path = require('path');

// Path to electron binary
const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');

// Clean environment: remove ELECTRON_RUN_AS_NODE
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

console.log('[run-electron] Starting Electron...');
const child = spawn(electronPath, ['.'], {
  cwd: path.join(__dirname, '..'),
  env,
  stdio: 'inherit',
  shell: false,
});

child.on('error', (err) => {
  console.error('[run-electron] Failed to start:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log('[run-electron] Electron exited with code', code);
  process.exit(code || 0);
});

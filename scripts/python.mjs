import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const python = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

if (!existsSync(python)) {
  console.error('Python environment not found. Create it with "python -m venv .venv" (or "python3 -m venv .venv"), then run "npm run install:backend".');
  process.exit(1);
}

const child = spawn(python, process.argv.slice(2), { cwd: root, stdio: 'inherit' });
const handlers = new Map();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const forward = () => child.kill(signal);
  handlers.set(signal, forward);
  process.on(signal, forward);
}

child.on('error', (error) => {
  console.error(`Unable to run ${python}: ${error.message}`);
  process.exitCode = 1;
});
child.on('close', (code, signal) => {
  for (const [name, handler] of handlers) process.removeListener(name, handler);
  process.exitCode = code ?? (signal ? 128 + (constants.signals[signal] ?? 1) : 1);
});

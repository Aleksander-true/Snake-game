import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const childProcesses = [
  startNpmScript('watch:contracts'),
  startNpmScript('watch:server'),
  startNpmScript('dev:web'),
];
let serverProcess = startServer();
const outputWatchers = [
  watch('apps/server/dist', scheduleServerRestart),
  watch('packages/contracts/dist', scheduleServerRestart),
];

let stopping = false;
let restartingServer = false;
let restartTimer;

for (const child of childProcesses) {
  child.on('exit', (code, signal) => {
    if (stopping) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    process.stderr.write(`Development process stopped with ${reason}\n`);
    stopAll(code ?? 1);
  });
}
observeServerExit(serverProcess);

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

function startNpmScript(script, environment = {}) {
  return spawn(npmCommand, ['run', script], {
    detached: process.platform !== 'win32',
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });
}

function startServer() {
  return spawn(process.execPath, ['apps/server/dist/index.js'], {
    env: { ...process.env, PORT: '3001' },
    stdio: 'inherit',
  });
}

function observeServerExit(child) {
  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (restartingServer) {
      restartingServer = false;
      serverProcess = startServer();
      observeServerExit(serverProcess);
      return;
    }
    const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
    process.stderr.write(`Development server stopped with ${reason}\n`);
    stopAll(code ?? 1);
  });
}

function scheduleServerRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (stopping || restartingServer) return;
    restartingServer = true;
    serverProcess.kill('SIGTERM');
  }, 300);
}

function stopAll(exitCode) {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  for (const watcher of outputWatchers) {
    watcher.close();
  }
  if (!serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
  for (const child of childProcesses) {
    if (!child.killed) {
      if (process.platform === 'win32') {
        child.kill('SIGTERM');
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      }
    }
  }
  process.exitCode = exitCode;
}

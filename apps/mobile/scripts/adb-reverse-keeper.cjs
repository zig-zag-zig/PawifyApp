#!/usr/bin/env node
/**
 * Keeps `adb reverse` tunnels alive for the duration of a Maestro run.
 *
 * The e2e app reaches the local API and Firebase auth emulator through
 * `adb reverse` (device 127.0.0.1:<port> -> host <port>). Those mappings are
 * dropped whenever the device transport reconnects, which Maestro's driver
 * setup does per flow. The mappings cannot be restored from the parent process
 * because each flow is spawned synchronously, so this runs alongside it.
 *
 * Usage:
 *   node scripts/adb-reverse-keeper.cjs --serial emulator-5554 --ports 10001,9199
 *
 * Exits when the parent process goes away, or on SIGTERM/SIGINT.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};

const serial = getArg('--serial', process.env.ANDROID_SERIAL || '');
const ports = String(getArg('--ports', '10001,9199'))
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const intervalMs = Number(getArg('--interval-ms', '1500'));
const parentPid = Number(getArg('--parent-pid', String(process.ppid)));

if (!serial || ports.length === 0) {
  console.error('[adb-reverse-keeper] --serial and --ports are required');
  process.exit(2);
}

const adb = process.env.ADB || 'adb';
let reportedMissing = false;

const listReversedPorts = () => {
  const result = spawnSync(adb, ['-s', serial, 'reverse', '--list'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim().match(/^tcp:(\d+)\s+tcp:(\d+)$/))
    .filter(Boolean)
    .map((match) => match[1]);
};

const ensurePorts = () => {
  const existing = listReversedPorts();
  const missing = existing === null ? ports : ports.filter((port) => !existing.includes(port));

  if (missing.length === 0) {
    reportedMissing = false;
    return;
  }

  if (!reportedMissing) {
    console.log(`[adb-reverse-keeper] restoring ${missing.join(', ')} on ${serial}`);
    reportedMissing = true;
  }

  for (const port of missing) {
    spawnSync(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`], {
      stdio: 'ignore',
    });
  }
};

const parentAlive = () => {
  if (!Number.isFinite(parentPid) || parentPid <= 1) {
    return true;
  }
  try {
    process.kill(parentPid, 0);
    return true;
  } catch {
    return false;
  }
};

ensurePorts();

const timer = setInterval(() => {
  if (!parentAlive()) {
    clearInterval(timer);
    process.exit(0);
  }
  ensurePorts();
}, intervalMs);

const shutdown = () => {
  clearInterval(timer);
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Detached so the parent can exit without waiting on it.
if (process.env.ADB_REVERSE_KEEPER_DETACHED === 'true') {
  process.stdin.unref?.();
  fs.closeSync?.(0);
}

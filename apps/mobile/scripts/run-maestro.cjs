#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ports = [10001, 9199];
const appId = process.env.MAESTRO_APP_ID?.trim() || 'vip.chi_chi.pawify';
const target = process.argv[2] ?? '.maestro';
const reversedPorts = [];
const signalExitCodes = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };
let pendingDeviceCleanup = null;
let cleanupInProgress = false;

function resolveMaestroBinary() {
  const explicitBinary = process.env.MAESTRO_BIN?.trim();
  if (explicitBinary) {
    return explicitBinary;
  }

  const localBinary = path.join(
    process.env.HOME ?? '',
    '.maestro',
    'bin',
    process.platform === 'win32' ? 'maestro.bat' : 'maestro',
  );
  return fs.existsSync(localBinary) ? localBinary : 'maestro';
}

function runPendingDeviceCleanup() {
  if (!pendingDeviceCleanup || cleanupInProgress) {
    return;
  }

  cleanupInProgress = true;
  try {
    pendingDeviceCleanup();
  } finally {
    pendingDeviceCleanup = null;
    cleanupInProgress = false;
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => {
    runPendingDeviceCleanup();
    process.exit(signalExitCodes[signal]);
  });
}

process.once('exit', runPendingDeviceCleanup);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? 'inherit',
    env: process.env,
    encoding: options.encoding,
  });

  if (result.error) {
    console.error(`[e2e] Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function runBestEffort(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: options.stdio ?? 'ignore',
    env: process.env,
    encoding: options.encoding,
  });
}

function runAdbBestEffort(deviceId, args, options = {}) {
  return runBestEffort('adb', ['-s', deviceId, ...args], options);
}

function resetAdbServerForMaestro() {
  if (process.env.MAESTRO_RESET_ADB === 'false') {
    return;
  }

  console.log('[e2e] restarting ADB before Maestro');
  runBestEffort('adb', ['kill-server']);
  run('adb', ['start-server']);
}

function validateRequestedDeviceIsEmulator() {
  const requestedSerial = process.env.ANDROID_SERIAL?.trim();
  if (requestedSerial && !requestedSerial.startsWith('emulator-')) {
    console.error(`[e2e] ANDROID_SERIAL must identify an Android emulator, got: ${requestedSerial}`);
    process.exit(1);
  }
}

function listConnectedDeviceIds() {
  const result = run('adb', ['devices'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });

  return String(result.stdout ?? '')
    .split('\n')
    .map(line => line.trim().match(/^(.+)\s+device(?:\s|$)/)?.[1]?.trim())
    .filter(Boolean);
}

function resolveDeviceId() {
  const preferredDevice = process.env.ANDROID_SERIAL?.trim() || null;
  const startedAt = Date.now();

  if (preferredDevice && !preferredDevice.startsWith('emulator-')) {
    console.error(`[e2e] ANDROID_SERIAL must identify an Android emulator, got: ${preferredDevice}`);
    process.exit(1);
  }

  while (Date.now() - startedAt < 30000) {
    const devices = listConnectedDeviceIds();
    if (preferredDevice && devices.includes(preferredDevice)) {
      return preferredDevice;
    }
    if (!preferredDevice) {
      const emulator = devices.find(device => device.startsWith('emulator-'));
      if (emulator) {
        return emulator;
      }
    }

    runBestEffort('sleep', ['1']);
  }

  console.error(preferredDevice
    ? `[e2e] Android emulator is not connected: ${preferredDevice}`
    : '[e2e] No Android emulator is connected. Physical devices are not valid E2E targets.');
  process.exit(1);
}

function getAutofillService(deviceId) {
  const result = runBestEffort('adb', ['-s', deviceId, 'shell', 'settings', 'get', 'secure', 'autofill_service'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  return String(result.stdout ?? '').trim() || 'null';
}

function setAutofillService(deviceId, value) {
  runAdbBestEffort(deviceId, ['shell', 'settings', 'put', 'secure', 'autofill_service', value || 'null']);
}

function getSetting(deviceId, namespace, name) {
  const result = runAdbBestEffort(deviceId, ['shell', 'settings', 'get', namespace, name], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  return String(result.stdout ?? '').trim() || 'null';
}

function putSetting(deviceId, namespace, name, value) {
  runAdbBestEffort(deviceId, ['shell', 'settings', 'put', namespace, name, value || 'null']);
}

function getDisplaySize(deviceId) {
  const result = runAdbBestEffort(deviceId, ['shell', 'wm', 'size'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });
  const match = String(result.stdout ?? '').match(/Physical size:\s*(\d+)x(\d+)/);
  if (!match) {
    return { width: 1080, height: 1920 };
  }

  return { width: Number(match[1]), height: Number(match[2]) };
}

function prepareDeviceForMaestro(deviceId) {
  if (process.env.MAESTRO_MANAGE_DEVICE_POWER === 'false') {
    return { originalScreenOffTimeout: null, originalStayOnWhilePluggedIn: null };
  }

  const originalScreenOffTimeout = getSetting(deviceId, 'system', 'screen_off_timeout');
  const originalStayOnWhilePluggedIn = getSetting(deviceId, 'global', 'stay_on_while_plugged_in');
  const screenOffTimeoutMs = process.env.MAESTRO_SCREEN_OFF_TIMEOUT_MS || '1800000';
  const { width, height } = getDisplaySize(deviceId);
  const x = Math.round(width / 2);

  console.log('[e2e] preparing Android device for Maestro');
  putSetting(deviceId, 'system', 'screen_off_timeout', screenOffTimeoutMs);
  putSetting(deviceId, 'global', 'stay_on_while_plugged_in', '7');
  runAdbBestEffort(deviceId, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  runAdbBestEffort(deviceId, ['shell', 'wm', 'dismiss-keyguard']);
  runAdbBestEffort(deviceId, ['shell', 'input', 'swipe', String(x), String(Math.round(height * 0.85)), String(x), String(Math.round(height * 0.25)), '250']);
  runAdbBestEffort(deviceId, ['shell', 'cmd', 'statusbar', 'collapse']);

  return { originalScreenOffTimeout, originalStayOnWhilePluggedIn };
}

function restoreDeviceAfterMaestro(deviceId, deviceState) {
  if (!deviceState || process.env.MAESTRO_MANAGE_DEVICE_POWER === 'false') {
    return;
  }

  console.log('[e2e] restoring Android device power settings');
  if (deviceState.originalScreenOffTimeout !== null) {
    putSetting(deviceId, 'system', 'screen_off_timeout', deviceState.originalScreenOffTimeout);
  }
  if (deviceState.originalStayOnWhilePluggedIn !== null) {
    putSetting(deviceId, 'global', 'stay_on_while_plugged_in', deviceState.originalStayOnWhilePluggedIn);
  }
}

function resolveMaestroTargets(targetPath) {
  const absoluteTarget = path.resolve(targetPath);
  if (!fs.existsSync(absoluteTarget)) {
    console.error(`[e2e] Maestro target does not exist: ${targetPath}`);
    process.exit(1);
  }

  if (!fs.statSync(absoluteTarget).isDirectory()) {
    return [targetPath];
  }

  const flowFiles = fs.readdirSync(absoluteTarget)
    .filter(name => /\.ya?ml$/i.test(name))
    .sort()
    .map(name => path.join(targetPath, name));

  if (flowFiles.length === 0) {
    console.error(`[e2e] Maestro target has no YAML flows: ${targetPath}`);
    process.exit(1);
  }

  return flowFiles;
}

function flowName(flowTarget) {
  return path.basename(flowTarget).replace(/\.ya?ml$/i, '');
}

function printFlowSummary(results) {
  const passed = results.filter(result => result.passed);
  const failed = results.filter(result => !result.passed);

  console.log('\n[e2e] Maestro flow summary');
  console.log(`[e2e] Passed: ${passed.length}`);
  for (const result of passed) {
    console.log(`  [OK] ${result.name}`);
  }
  console.log(`[e2e] Failed: ${failed.length}`);
  for (const result of failed) {
    console.log(`  [FAILED] ${result.name}`);
  }
  console.log(`[e2e] Total: ${results.length}`);
}

function grantNotificationPermission(deviceId) {
  // Android 13+ gates local notifications behind POST_NOTIFICATIONS. Grant
  // it upfront so flows can post local test notifications deterministically
  // (the runtime permission dialog is not part of any flow).
  runAdbBestEffort(deviceId, [
    'shell',
    'pm',
    'grant',
    appId,
    'android.permission.POST_NOTIFICATIONS',
  ]);
}

function runMaestro(deviceId, maestroArgs, flowTargets) {
  const maestroBinary = resolveMaestroBinary();
  const shouldManageAutofill = process.env.MAESTRO_DISABLE_AUTOFILL !== 'false';
  const originalAutofillService = shouldManageAutofill ? getAutofillService(deviceId) : null;
  const deviceState = prepareDeviceForMaestro(deviceId);
  grantNotificationPermission(deviceId);
  let autofillChanged = false;
  let cleanupComplete = false;

  const cleanup = () => {
    if (cleanupComplete) {
      return;
    }
    cleanupComplete = true;

    if (autofillChanged && originalAutofillService !== null) {
      console.log('[e2e] restoring Android autofill');
      setAutofillService(deviceId, originalAutofillService);
    }
    restoreDeviceAfterMaestro(deviceId, deviceState);
    stopAdbReverseKeeper();
    removeAdbReversePorts(deviceId);
  };

  pendingDeviceCleanup = cleanup;

  let exitStatus = 0;
  const results = [];
  try {
    if (shouldManageAutofill) {
      console.log('[e2e] temporarily disabling Android autofill');
      setAutofillService(deviceId, 'null');
      autofillChanged = true;
    }

    for (const flowTarget of flowTargets) {
      const name = flowName(flowTarget);
      console.log(`\n[e2e] Running flow: ${name}`);
      // A restart of the ADB server between flows would otherwise drop the
      // tunnels and make this flow fail at sign-in.
      ensureAdbReversePorts(deviceId);
      const result = spawnSync(maestroBinary, [...maestroArgs, flowTarget], {
        stdio: 'inherit',
        env: process.env,
      });

      if (result.error) {
        console.error(`[e2e] Failed to run ${maestroBinary}: ${result.error.message}`);
        results.push({ name, passed: false });
        exitStatus = 1;
        break;
      }
      const passed = result.status === 0;
      results.push({ name, passed });
      if (!passed) {
        exitStatus = result.status ?? 1;
      }
    }
  } finally {
    cleanup();
    pendingDeviceCleanup = null;
  }

  printFlowSummary(results);

  return exitStatus;
}

validateRequestedDeviceIsEmulator();
resetAdbServerForMaestro();
const deviceId = resolveDeviceId();
console.log(`[e2e] device=${deviceId}`);

function listReversedPorts(deviceId) {
  const result = spawnSync('adb', ['-s', deviceId, 'reverse', '--list'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return String(result.stdout ?? '')
    .split('\n')
    .map(line => line.trim().match(/^tcp:(\d+)\s+tcp:(\d+)$/))
    .filter(Boolean)
    .map(match => match[1]);
}

/**
 * (Re)establishes the reverse tunnels the app needs to reach the local API and
 * auth emulator.
 *
 * These are set up once before Maestro starts, but anything that restarts the
 * ADB server mid-run (another project's e2e runner doing `adb kill-server`, a
 * driver reinstall reconnecting) silently drops them. The app then cannot reach
 * the auth emulator and flows fail at sign-in with a misleading timeout, so
 * they are re-asserted before every flow.
 */
function ensureAdbReversePorts(deviceId) {
  if (process.env.MAESTRO_SKIP_ADB_REVERSE === 'true') {
    return;
  }

  const existing = listReversedPorts(deviceId);
  const missing = existing === null ? ports : ports.filter(port => !existing.includes(port));

  if (missing.length === 0) {
    return;
  }

  if (reversedPorts.length > 0) {
    console.log(`[e2e] adb reverse tunnels were lost; restoring ${missing.join(', ')}`);
  }

  for (const port of missing) {
    run('adb', ['-s', deviceId, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    if (!reversedPorts.includes(port)) {
      reversedPorts.push(port);
    }
  }
}

let adbReverseKeeper = null;

/**
 * Runs scripts/adb-reverse-keeper.cjs for the lifetime of the Maestro session.
 *
 * The tunnels are also asserted once before the flows, but Maestro's per-flow
 * driver setup reconnects the device and drops the `adb reverse` mappings. The
 * flows are spawned synchronously, so the parent cannot re-assert them while a
 * flow runs; the keeper does it from a separate process.
 */
function startAdbReverseKeeper(deviceId) {
  if (process.env.MAESTRO_SKIP_ADB_REVERSE === 'true' || adbReverseKeeper) {
    return;
  }

  adbReverseKeeper = spawn(
    process.execPath,
    [
      path.join(__dirname, 'adb-reverse-keeper.cjs'),
      '--serial', deviceId,
      '--ports', ports.join(','),
      '--parent-pid', String(process.pid),
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );

  adbReverseKeeper.on('error', (error) => {
    console.warn(`[e2e] adb reverse keeper failed to start: ${error.message}`);
  });
  adbReverseKeeper.unref();
}

function stopAdbReverseKeeper() {
  if (!adbReverseKeeper) {
    return;
  }

  adbReverseKeeper.kill('SIGTERM');
  adbReverseKeeper = null;
}

ensureAdbReversePorts(deviceId);
startAdbReverseKeeper(deviceId);

function removeAdbReversePorts(deviceId) {
  if (process.env.MAESTRO_SKIP_ADB_REVERSE === 'true') {
    return;
  }

  for (const port of reversedPorts) {
    runAdbBestEffort(deviceId, ['reverse', '--remove', `tcp:${port}`]);
  }
}

const maestroArgs = ['test', '--device', deviceId];
if (process.env.MAESTRO_REINSTALL_DRIVER !== 'false') {
  maestroArgs.push('--reinstall-driver');
}
for (const name of [
  'E2E_EMAIL',
  'E2E_MUSIC_EMAIL',
  'E2E_NOTIFICATION_EMAIL',
  'E2E_FEATURE_SEARCH_EMAIL',
  'E2E_FEATURE_RELATED_EMAIL',
  'E2E_FEATURE_DEEPLINK_EMAIL',
  'E2E_FEATURE_LISTEN_EMAIL',
]) {
  if (process.env[name]) {
    maestroArgs.push(`--env=${name}=${process.env[name]}`);
  }
}

process.exitCode = runMaestro(deviceId, maestroArgs, resolveMaestroTargets(target));

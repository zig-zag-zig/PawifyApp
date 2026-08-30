#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const appConfig = require(path.join(projectRoot, 'app.json'));
const packageName = appConfig.expo.android.package;
const apkPath = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', `${appConfig.expo.name}.apk`);

function run(command, args, options = {}) {
  console.log(`[smoke] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.error) {
    console.error(`[smoke] ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

function ensureSingleDevice() {
  const output = run('adb', ['devices'], { capture: true });
  const devices = output
    .split('\n')
    .slice(1)
    .map(line => line.trim())
    .filter(line => line.endsWith('\tdevice'))
    .map(line => line.split('\t')[0]);

  if (devices.length !== 1) {
    console.error(`[smoke] Expected exactly one connected Android device, found ${devices.length}.`);
    process.exit(1);
  }

  return devices[0];
}

// Deco WiFi wedge workaround: real-device installs go through safe-adb, which
// auto-recovers the WiFi link and retries when the transfer wedges.
function adbCommandForDevice(deviceId) {
  if (!deviceId || deviceId.startsWith('emulator-')) {
    return 'adb';
  }
  const safeAdb = path.join(process.env.HOME ?? '', '.local', 'bin', 'safe-adb');
  return fs.existsSync(safeAdb) ? 'safe-adb' : 'adb';
}

if (!fs.existsSync(apkPath)) {
  console.error(`[smoke] Missing release APK: ${path.relative(projectRoot, apkPath)}`);
  console.error('[smoke] Run npm run build:release:local first.');
  process.exit(1);
}

const smokeDevice = ensureSingleDevice();
run(adbCommandForDevice(smokeDevice), ['-s', smokeDevice, 'install', '--user', '0', '-r', '-d', apkPath]);
run('adb', ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);

console.log(`
[smoke] Release APK installed and launched on the main Android profile.

Manual smoke checklist:
  1. Sign in with email/password and Google.
  2. Open Settings > Update and run a manual update check.
  3. Open at least one external artist/link URL and return to the app.
  4. Follow/unfollow an artist and confirm the following list updates.
  5. Trigger or wait for a release/background task notification, then open it.
  6. Leave the app, return after a few minutes, and confirm polling/task UI resumes.
  7. Confirm notifications can be received while the app is backgrounded.
`);

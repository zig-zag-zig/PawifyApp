#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const apkPath = path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'Pawify.apk');

function run(label, command, args, options = {}) {
  console.log(`[release-check] ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    env: {
      ...process.env,
      APP_ENV: 'production',
      NODE_ENV: 'production',
      ...(options.env ?? {}),
    },
    stdio: options.stdio ?? 'inherit',
    encoding: options.stdio ? undefined : 'utf8',
  });

  if (result.error) {
    console.error(`[release-check] ${label} failed: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    console.error(`[release-check] ${label} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

function findApkSigner() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(process.env.HOME ?? '', 'Android', 'Sdk'),
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const buildToolsDir = path.join(sdkRoot, 'build-tools');
    if (!fs.existsSync(buildToolsDir)) {
      continue;
    }

    const versions = fs.readdirSync(buildToolsDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const version of versions.reverse()) {
      const candidate = path.join(buildToolsDir, version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

run('validate Android toolchain pins', 'node', ['scripts/validate-android-toolchain.cjs']);
run('validate production release config', 'node', ['scripts/validate-release-config.cjs']);
run('expo-doctor', 'node', ['scripts/with-env.cjs', 'production', '--', 'npx', 'expo-doctor']);
run('expo dependency check', 'node', ['scripts/with-env.cjs', 'production', '--', 'npx', 'expo', 'install', '--check']);
run('TypeScript', 'node', ['scripts/with-env.cjs', 'production', '--', 'npx', 'tsc', '--noEmit', '--pretty', 'false']);
run('npm audit', 'npm', ['audit', '--omit=dev']);
run('git diff whitespace check', 'git', ['diff', '--check']);
run('staged git diff whitespace check', 'git', ['diff', '--cached', '--check']);
run('release APK build', 'node', ['scripts/with-env.cjs', 'production', '--', 'node', 'scripts/android-local-build.cjs', 'release']);

const apksigner = findApkSigner();
if (!apksigner) {
  console.error('[release-check] Could not find apksigner in ANDROID_HOME, ANDROID_SDK_ROOT, or ~/Android/Sdk.');
  process.exit(1);
}

run('release APK signature verification', apksigner, ['verify', '--verbose', '--print-certs', apkPath]);
console.log('[release-check] Release checks passed.');

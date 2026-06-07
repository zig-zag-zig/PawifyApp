#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(projectRoot, 'android');
const appConfigPath = path.join(projectRoot, 'app.config.js');
const appJsonPath = path.join(projectRoot, 'app.json');
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageLockPath = path.join(projectRoot, 'package-lock.json');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const args = process.argv.slice(2);

const variantArg = args.shift() ?? 'debug';
const variant = variantArg.toLowerCase();
const clean = args.includes('--clean');
const install = args.includes('--install');
const dryRun = args.includes('--dry-run');
const supportedOptions = new Set([
  '--clean',
  '--install',
  '--dry-run',
  '--bump-patch',
  '--bump-minor',
  '--bump-major',
]);
const bumpFlags = ['--bump-patch', '--bump-minor', '--bump-major'].filter(flag => args.includes(flag));
const bumpKind = bumpFlags[0]?.replace('--bump-', '') ?? null;

const variants = {
  debug: 'Debug',
  release: 'Release',
};
const supportedAndroidArchitectures = new Set(['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']);

function printUsage() {
  console.error('[android-build] Usage: node scripts/android-local-build.cjs debug|release [--clean] [--install] [--dry-run] [--bump-patch|--bump-minor|--bump-major]');
  console.error('[android-build] Set ANDROID_BUILD_ARCHITECTURES or REACT_NATIVE_ARCHITECTURES to override the default ABI list.');
}

for (const arg of args) {
  if (!supportedOptions.has(arg)) {
    console.error(`[android-build] Unknown option: ${arg}`);
    printUsage();
    process.exit(2);
  }
}

if (bumpFlags.length > 1) {
  console.error('[android-build] Choose only one version bump flag.');
  printUsage();
  process.exit(2);
}

if (!variants[variant]) {
  console.error(`[android-build] Unknown variant: ${variantArg}`);
  printUsage();
  process.exit(2);
}

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? (process.env.APP_ENV === 'production' ? 'production' : 'development'),
  CMAKE_BUILD_PARALLEL_LEVEL: process.env.CMAKE_BUILD_PARALLEL_LEVEL ?? '2',
};

function hasSentryUploadConfig(buildEnv) {
  return Boolean(
    buildEnv.SENTRY_AUTH_TOKEN?.trim()
    && buildEnv.SENTRY_ORG?.trim()
    && buildEnv.SENTRY_PROJECT?.trim(),
  );
}

if (variant === 'release' && !hasSentryUploadConfig(env)) {
  env.SENTRY_DISABLE_AUTO_UPLOAD = 'true';
}

function formatCommand(command, commandArgs) {
  return [command, ...commandArgs].join(' ');
}

function fail(message) {
  console.error(`[android-build] ${message}`);
  process.exit(1);
}

function normalizeAndroidArchitectures(value, source) {
  const architectures = value
    .split(',')
    .map(architecture => architecture.trim())
    .filter(Boolean);

  const invalidArchitectures = architectures
    .filter(architecture => !supportedAndroidArchitectures.has(architecture));

  if (architectures.length === 0 || invalidArchitectures.length > 0) {
    fail(`${source} must be a comma-separated list of: ${Array.from(supportedAndroidArchitectures).join(', ')}`);
  }

  return architectures.join(',');
}

function resolveReactNativeArchitectures() {
  const explicitArchitectures = env.ANDROID_BUILD_ARCHITECTURES?.trim()
    || env.REACT_NATIVE_ARCHITECTURES?.trim();

  if (explicitArchitectures) {
    return normalizeAndroidArchitectures(explicitArchitectures, 'Android architectures override');
  }

  if (env.APP_ENV === 'e2e-test') {
    return 'x86_64';
  }

  if (variant === 'debug') {
    return 'arm64-v8a';
  }

  return null;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validateBumpableVersion(version, source) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`${source} must be a simple x.y.z version before using a bump flag.`);
  }

  return version;
}

function bumpVersion(version, kind) {
  const parts = version.split('.').map(Number);
  if (kind === 'major') {
    return `${parts[0] + 1}.0.0`;
  }
  if (kind === 'minor') {
    return `${parts[0]}.${parts[1] + 1}.0`;
  }

  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function updatePackageLockVersion(previousVersion, nextVersion) {
  if (!fs.existsSync(packageLockPath)) {
    return null;
  }

  const packageLock = readJsonFile(packageLockPath);
  let trackedRootVersion = false;

  if (Object.prototype.hasOwnProperty.call(packageLock, 'version')) {
    trackedRootVersion = true;
    if (packageLock.version !== previousVersion) {
      fail(`package-lock.json version (${packageLock.version}) must match package.json version (${previousVersion}) before using a bump flag.`);
    }
    packageLock.version = nextVersion;
  }

  if (
    packageLock.packages?.['']
    && Object.prototype.hasOwnProperty.call(packageLock.packages[''], 'version')
  ) {
    trackedRootVersion = true;
    if (packageLock.packages[''].version !== previousVersion) {
      fail(`package-lock.json packages[""].version (${packageLock.packages[''].version}) must match package.json version (${previousVersion}) before using a bump flag.`);
    }
    packageLock.packages[''].version = nextVersion;
  }

  if (!trackedRootVersion) {
    fail('package-lock.json does not contain a root package version to update.');
  }

  return packageLock;
}

function bumpVersionIfRequested() {
  if (!bumpKind) {
    return;
  }

  const packageJson = readJsonFile(packageJsonPath);
  const appJson = readJsonFile(appJsonPath);
  if (!appJson.expo) {
    fail('app.json must contain an expo object before using a bump flag.');
  }
  if (!appJson.expo.android) {
    fail('app.json expo.android must be set before using a bump flag.');
  }

  const packageVersion = validateBumpableVersion(packageJson.version, 'package.json version');
  const appVersion = validateBumpableVersion(appJson.expo.version, 'app.json expo.version');
  if (packageVersion !== appVersion) {
    fail(`package.json version (${packageVersion}) and app.json expo.version (${appVersion}) must match before using a bump flag.`);
  }

  const currentVersionCode = appJson.expo.android.versionCode;
  if (!Number.isInteger(currentVersionCode) || currentVersionCode < 1) {
    fail('app.json expo.android.versionCode must be a positive integer before using a bump flag.');
  }

  const nextVersion = bumpVersion(appVersion, bumpKind);
  const nextVersionCode = currentVersionCode + 1;
  const packageLock = updatePackageLockVersion(appVersion, nextVersion);
  console.log(`[android-build] bump ${bumpKind}: version ${appVersion} -> ${nextVersion}, android.versionCode ${currentVersionCode} -> ${nextVersionCode}`);

  if (dryRun) {
    const files = packageLock ? 'package.json, package-lock.json, or app.json' : 'package.json or app.json';
    console.log(`[android-build] dry run; not writing ${files}`);
    return;
  }

  packageJson.version = nextVersion;
  appJson.expo.version = nextVersion;
  appJson.expo.android.versionCode = nextVersionCode;
  writeJsonFile(packageJsonPath, packageJson);
  writeJsonFile(appJsonPath, appJson);
  if (packageLock) {
    writeJsonFile(packageLockPath, packageLock);
  }
}

function run(command, commandArgs, options = {}) {
  const cwd = options.cwd ?? projectRoot;
  console.log(`[android-build] ${path.relative(projectRoot, cwd) || '.'}$ ${formatCommand(command, commandArgs)}`);

  if (dryRun) {
    return;
  }

  const result = spawnSync(command, commandArgs, {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[android-build] Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveAdbDeviceId() {
  const requestedSerial = process.env.ANDROID_SERIAL?.trim();
  if (requestedSerial) {
    if (env.APP_ENV === 'e2e-test' && !requestedSerial.startsWith('emulator-')) {
      fail(`e2e-test builds may only install on an Android emulator, got ANDROID_SERIAL=${requestedSerial}`);
    }
    return requestedSerial;
  }

  const result = spawnSync('adb', ['devices'], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  const devices = String(result.stdout ?? '')
    .split('\n')
    .map(line => line.trim().match(/^(.+)\s+device(?:\s|$)/)?.[1]?.trim())
    .filter(Boolean);

  const emulator = devices.find(device => device.startsWith('emulator-')) ?? null;
  if (env.APP_ENV === 'e2e-test') {
    if (emulator) {
      return emulator;
    }
    if (dryRun) {
      return '<android-emulator>';
    }
    fail('e2e-test builds may only install on an Android emulator, but no emulator is connected.');
  }

  return emulator ?? devices[0] ?? null;
}

function withAdbDevice(commandArgs) {
  const deviceId = resolveAdbDeviceId();
  return deviceId ? ['-s', deviceId, ...commandArgs] : commandArgs;
}

function getAdbArgs(commandArgs) {
  return withAdbDevice(commandArgs);
}

function readDynamicExpoConfig() {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  if (!fs.existsSync(appConfigPath)) {
    return appJson.expo;
  }

  delete require.cache[require.resolve(appConfigPath)];
  const createConfig = require(appConfigPath);
  if (typeof createConfig === 'function') {
    return createConfig({ config: {} });
  }

  return appJson.expo;
}

function readAndroidPackageName() {
  return readDynamicExpoConfig().android?.package;
}

function runAdbBestEffort(commandArgs) {
  const adbArgs = getAdbArgs(commandArgs);
  console.log(`[android-build] .$ ${formatCommand('adb', adbArgs)}`);
  if (dryRun) {
    return;
  }

  spawnSync('adb', adbArgs, {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
}

function readAppName() {
  const appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const appName = appConfig.expo?.name?.trim();
  if (!appName) {
    console.error('[android-build] expo.name must be set in app.json');
    process.exit(1);
  }

  return appName.replace(/[^a-z0-9._-]/gi, '-');
}

function getGradleApkPath() {
  return path.join(androidRoot, 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`);
}

function isE2eBuild() {
  return env.APP_ENV === 'e2e-test';
}

function getNamedApkPath() {
  if (isE2eBuild()) {
    const suffix = variant === 'debug' ? 'e2e-debug' : 'e2e';
    return path.join(androidRoot, 'app', 'build', 'outputs', 'apk', 'e2e', `${readAppName()}-${suffix}.apk`);
  }

  const apkFileName = variant === 'debug'
    ? `${readAppName()}-debug.apk`
    : `${readAppName()}.apk`;

  return path.join(androidRoot, 'app', 'build', 'outputs', 'apk', variant, apkFileName);
}

function moveNamedApk() {
  const sourceApk = getGradleApkPath();
  const namedApk = getNamedApkPath();
  console.log(`[android-build] apk ${path.relative(projectRoot, sourceApk)} -> ${path.relative(projectRoot, namedApk)}`);

  if (dryRun) {
    return namedApk;
  }

  if (!fs.existsSync(sourceApk)) {
    console.error(`[android-build] Expected APK was not created: ${path.relative(projectRoot, sourceApk)}`);
    process.exit(1);
  }

  if (sourceApk !== namedApk) {
    fs.mkdirSync(path.dirname(namedApk), { recursive: true });
    if (fs.existsSync(namedApk)) {
      fs.unlinkSync(namedApk);
    }
    fs.renameSync(sourceApk, namedApk);
  }
  return namedApk;
}

function installOnMainProfile(apkPath) {
  if (env.APP_ENV === 'e2e-test') {
    const packageName = readAndroidPackageName();
    if (packageName) {
      console.log(`[android-build] uninstalling existing e2e app ${packageName} if present`);
      runAdbBestEffort(['uninstall', packageName]);
    }
  }

  run('adb', getAdbArgs(['install', '--user', '0', '-r', '-d', apkPath]));
}

const prebuildArgs = ['expo', 'prebuild', '--platform', 'android'];
if (clean) {
  prebuildArgs.push('--clean');
}

const gradleTask = `:app:assemble${variants[variant]}`;
const gradleBuildArgs = clean
  ? ['clean', gradleTask]
  : [gradleTask];
const reactNativeArchitectures = resolveReactNativeArchitectures();
if (reactNativeArchitectures) {
  gradleBuildArgs.unshift(`-PreactNativeArchitectures=${reactNativeArchitectures}`);
}
const gradleArgs = env.APP_ENV === 'e2e-test'
  ? ['--no-daemon', ...gradleBuildArgs]
  : gradleBuildArgs;

bumpVersionIfRequested();
run('npx', prebuildArgs);
run('node', ['scripts/configure-android-gradle.cjs']);
run('node', ['scripts/sync-android-version.cjs']);
run(gradlew, gradleArgs, { cwd: androidRoot });

const apkPath = moveNamedApk();
if (install) {
  installOnMainProfile(apkPath);
}

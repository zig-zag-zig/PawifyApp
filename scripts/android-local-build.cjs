#!/usr/bin/env node

const fs = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(projectRoot, 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const args = process.argv.slice(2);

const variantArg = args.shift() ?? 'debug';
const variant = variantArg.toLowerCase();
const clean = args.includes('--clean');
const install = args.includes('--install');
const dryRun = args.includes('--dry-run');

const variants = {
  debug: 'Debug',
  release: 'Release',
};

if (!variants[variant]) {
  console.error(`[android-build] Unknown variant: ${variantArg}`);
  console.error('[android-build] Usage: node scripts/android-local-build.cjs debug|release [--clean] [--install]');
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

function readAppName() {
  const appConfigPath = path.join(projectRoot, 'app.json');
  const appConfig = JSON.parse(fs.readFileSync(appConfigPath, 'utf8'));
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

function getNamedApkPath() {
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
    if (fs.existsSync(namedApk)) {
      fs.unlinkSync(namedApk);
    }
    fs.renameSync(sourceApk, namedApk);
  }
  return namedApk;
}

function installOnMainProfile(apkPath) {
  run('adb', ['install', '--user', '0', '-r', '-d', apkPath]);
}

const prebuildArgs = ['expo', 'prebuild', '--platform', 'android'];
if (clean) {
  prebuildArgs.push('--clean');
}

const gradleTask = `:app:assemble${variants[variant]}`;
const gradleArgs = clean
  ? ['clean', gradleTask]
  : [gradleTask];

run('npx', prebuildArgs);
run('node', ['scripts/configure-android-gradle.cjs']);
run('node', ['scripts/sync-android-version.cjs']);
run(gradlew, gradleArgs, { cwd: androidRoot });

const apkPath = moveNamedApk();
if (install) {
  installOnMainProfile(apkPath);
}

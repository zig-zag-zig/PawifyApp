#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const {
  getMissingRequiredPublicEnvKeys,
  loadAppEnv,
} = require('./load-env.cjs');

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let appEnv = null;
let printOnly = false;
let syncEasEnv = null;
let easEnvironment = null;

if (args[0] && args[0] !== '--' && !args[0].startsWith('-')) {
  appEnv = args.shift();
}

while (args[0]?.startsWith('-') && args[0] !== '--') {
  const option = args.shift();
  if (option === '--print') {
    printOnly = true;
    continue;
  }

  if (option === '--sync-eas-env') {
    syncEasEnv = true;
    continue;
  }

  if (option === '--no-sync-eas-env') {
    syncEasEnv = false;
    continue;
  }

  if (option === '--eas-environment') {
    easEnvironment = args.shift() ?? null;
    continue;
  }

  if (option === '--env') {
    appEnv = args.shift() ?? null;
    continue;
  }

  console.error(`[env] Unknown option: ${option}`);
  process.exit(2);
}

if (args[0] === '--') {
  args.shift();
}

process.env.EXPO_NO_DOTENV = process.env.EXPO_NO_DOTENV ?? '1';

const result = loadAppEnv({
  appEnv: appEnv ?? undefined,
  projectRoot,
  override: true,
});
process.env.NODE_ENV = process.env.NODE_ENV ?? (result.appEnv === 'production' ? 'production' : 'development');

const missingRequiredKeys = getMissingRequiredPublicEnvKeys();
if (missingRequiredKeys.length > 0) {
  console.error(`[env] Missing required keys for APP_ENV=${result.appEnv}: ${missingRequiredKeys.join(', ')}`);
  console.error(`[env] Add the missing keys to .env, .env.${result.appEnv}, or export them before running this command.`);
  process.exit(1);
}

if (printOnly) {
  console.log(`[env] keys=${result.loadedKeys.sort().join(', ') || '(none)'}`);
  process.exit(0);
}

if (args.length === 0) {
  console.error('[env] Missing command. Usage: node scripts/with-env.cjs production -- npx expo start');
  process.exit(2);
}

function getEasArgs(commandArgs) {
  const command = path.basename(commandArgs[0] ?? '').replace(/\.cmd$/i, '');
  const rest = commandArgs.slice(1);

  if (command === 'eas') {
    return rest;
  }

  if (command === 'npx' && rest[0] === 'eas') {
    return rest.slice(1);
  }

  return null;
}

function isCloudEasBuildCommand(commandArgs) {
  const easArgs = getEasArgs(commandArgs);
  return Boolean(easArgs && easArgs[0] === 'build' && !easArgs.includes('--local'));
}

function isLocalAndroidCommand(commandArgs) {
  const command = path.basename(commandArgs[0] ?? '').replace(/\.cmd$/i, '');
  const rest = commandArgs.slice(1);

  return (
    (command === 'node' && rest[0] === 'scripts/android-local-build.cjs') ||
    (command === 'expo' && rest[0] === 'run:android') ||
    (command === 'npx' && rest[0] === 'expo' && rest[1] === 'run:android')
  );
}

function resolveEasEnvironment(appEnv) {
  const environment = easEnvironment ?? appEnv;
  if (['development', 'preview', 'production'].includes(environment)) {
    return environment;
  }

  console.error(`[env] Cannot sync APP_ENV=${appEnv} to EAS. Use one of: development, preview, production.`);
  console.error('[env] You can override with --eas-environment development|preview|production.');
  process.exit(2);
}

function visibilityForEnvKey(key) {
  return key.startsWith('EXPO_PUBLIC_') ? 'plaintext' : 'sensitive';
}

function syncLoadedEnvToEas(result) {
  const keys = result.loadedKeys
    .filter((key) => typeof process.env[key] === 'string')
    .sort();

  if (keys.length === 0) {
    console.log('[env] No .env keys to sync to EAS.');
    return;
  }

  const environment = resolveEasEnvironment(result.appEnv);
  console.log(`[env] Syncing ${keys.length} key(s) to EAS ${environment} environment.`);

  keys.forEach((key) => {
    const visibility = visibilityForEnvKey(key);
    const sync = spawnSync('npx', [
      'eas',
      'env:create',
      environment,
      '--name',
      key,
      '--value',
      process.env[key],
      '--visibility',
      visibility,
      '--type',
      'string',
      '--scope',
      'project',
      '--force',
      '--non-interactive',
    ], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['inherit', 'inherit', 'inherit'],
    });

    if (sync.error) {
      console.error(`[env] Failed to sync ${key} to EAS: ${sync.error.message}`);
      process.exit(1);
    }

    if (sync.status !== 0) {
      console.error(`[env] Failed to sync ${key} to EAS.`);
      process.exit(sync.status ?? 1);
    }

    console.log(`[env] Synced ${key} (${visibility}).`);
  });
}

if (syncEasEnv === true || (syncEasEnv !== false && isCloudEasBuildCommand(args))) {
  syncLoadedEnvToEas(result);
}

if (isLocalAndroidCommand(args)) {
  process.env.CMAKE_BUILD_PARALLEL_LEVEL = process.env.CMAKE_BUILD_PARALLEL_LEVEL ?? '2';
}

const child = spawn(args[0], args.slice(1), {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const {
  getMissingRequiredPublicEnvKeys,
  loadAppEnv,
} = require('./load-env.cjs');

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let appEnv = null;
let printOnly = false;

if (args[0] && args[0] !== '--' && !args[0].startsWith('-')) {
  appEnv = args.shift();
}

while (args[0]?.startsWith('-') && args[0] !== '--') {
  const option = args.shift();
  if (option === '--print') {
    printOnly = true;
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
  const effectivePublicKeys = Object.keys(process.env)
    .filter(key => key === 'APP_ENV' || key === 'NODE_ENV' || key.startsWith('EXPO_PUBLIC_'))
    .sort();
  console.log(`[env] effective=${effectivePublicKeys.join(', ') || '(none)'}`);
  process.exit(0);
}

if (args.length === 0) {
  console.error('[env] Missing command. Usage: node scripts/with-env.cjs production -- npx expo start');
  process.exit(2);
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

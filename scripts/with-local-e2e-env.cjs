#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const defaults = {
  APP_ENV: 'e2e-test',
  NODE_ENV: 'development',
  EXPO_PUBLIC_API_BASE_URL: 'http://127.0.0.1:10000/',
  EXPO_PUBLIC_API_VERSION: 'v1',
  EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-pawify-e2e',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'fake-e2e-google-client-id.apps.googleusercontent.com',
  EXPO_PUBLIC_SENTRY_DSN: '',
  EXPO_PUBLIC_SENTRY_ENABLED: 'false',
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0',
  SENTRY_DISABLE_AUTO_UPLOAD: 'true',
};

const env = { ...process.env };
for (const [key, value] of Object.entries(defaults)) {
  env[key] = value;
}
env.EXPO_NO_DOTENV = '1';
env.CMAKE_BUILD_PARALLEL_LEVEL = env.CMAKE_BUILD_PARALLEL_LEVEL ?? '2';

const delegatedArgs = process.argv.slice(2);
const commandArgs = delegatedArgs[0] === '--' ? delegatedArgs.slice(1) : delegatedArgs;

if (commandArgs.length === 0) {
  console.error('[e2e-env] Missing command. Usage: node scripts/with-local-e2e-env.cjs -- <command>');
  process.exit(2);
}

console.log('[e2e-env] APP_ENV=e2e-test');
console.log(`[e2e-env] command=${commandArgs.join(' ')}`);

const child = spawn(commandArgs[0], commandArgs.slice(1), {
  cwd: path.resolve(__dirname, '..'),
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

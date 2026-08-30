#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function run(label, args) {
  console.log(`[expo-maintenance] ${label}`);
  const result = spawnSync('node', ['scripts/with-env.cjs', 'development', '--', ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[expo-maintenance] ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('expo-doctor', ['npx', 'expo-doctor']);
run('expo install --check', ['npx', 'expo', 'install', '--check']);
console.log('[expo-maintenance] Expo maintenance checks passed.');

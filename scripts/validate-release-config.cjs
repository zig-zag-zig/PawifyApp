#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { loadAppEnv } = require('./load-env.cjs');

const projectRoot = path.resolve(__dirname, '..');
const loadedEnv = loadAppEnv({
  appEnv: 'production',
  projectRoot,
  override: true,
  silent: true,
});

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      APP_ENV: loadedEnv.appEnv,
      NODE_ENV: 'production',
    },
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    throw new Error(output || `${command} ${args.join(' ')} failed`);
  }

  return result.stdout;
}

function fail(message) {
  console.error(`[release-config] ${message}`);
  process.exitCode = 1;
}

function warn(message) {
  console.warn(`[release-config] warning: ${message}`);
}

function getPluginName(plugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

function requireHttpsEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} is required for production release checks.`);
    return;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      fail(`${name} must use https in production release checks.`);
    }
  } catch {
    fail(`${name} must be a valid URL.`);
  }
}

const config = JSON.parse(run('npx', ['expo', 'config', '--json']));
const pluginNames = new Set((config.plugins ?? []).map(getPluginName));

if (pluginNames.has('expo-dev-client')) {
  fail('production config must not include expo-dev-client.');
}

for (const devPlugin of ['expo-dev-launcher', 'expo-dev-menu', 'expo-dev-menu-interface']) {
  if (pluginNames.has(devPlugin)) {
    fail(`production config must not include ${devPlugin}.`);
  }
}

const hasSentryDsn = Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN?.trim());
const hasSentryPlugin = pluginNames.has('@sentry/react-native/expo') || pluginNames.has('@sentry/react-native');

if (config.runtimeVersion?.policy !== 'appVersion') {
  fail('runtimeVersion.policy must be appVersion so updates are tied to compatible app versions.');
}

if (!config.android?.package) {
  fail('android.package must be configured.');
}

if (config.updates?.fallbackToCacheTimeout !== 0) {
  warn('updates.fallbackToCacheTimeout is expected to be 0 for immediate startup behavior.');
}

requireHttpsEnv('EXPO_PUBLIC_API_BASE_URL');

if (process.env.EXPO_PUBLIC_UPDATE_GITHUB_TOKEN?.trim()) {
  fail('EXPO_PUBLIC_UPDATE_GITHUB_TOKEN is public client config. Do not ship a PAT in production builds.');
}

if (!hasSentryDsn) {
  warn('EXPO_PUBLIC_SENTRY_DSN is not set; production crash reporting will be disabled.');
}

if (hasSentryDsn && !hasSentryPlugin) {
  fail('Sentry DSN is set, so production config must include the Sentry Expo plugin.');
}

if (hasSentryDsn && process.env.SENTRY_DISABLE_AUTO_UPLOAD !== 'true') {
  for (const key of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
    if (!process.env[key]?.trim()) {
      fail(`${key} is required for Sentry source-map uploads. Set SENTRY_DISABLE_AUTO_UPLOAD=true only for builds where upload is intentionally disabled.`);
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('[release-config] production config looks valid.');

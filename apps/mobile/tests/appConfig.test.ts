import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import appConfig from '../app.json';

const SPLASH_BACKGROUND_COLOR = '#121212';
const LAUNCHER_BACKGROUND_COLOR = '#EAD8DD';
const require = createRequire(import.meta.url);

function loadDynamicExpoConfig(appEnv: string) {
  const configPath = require.resolve('../app.config.js');
  const originalEnv = { ...process.env };
  delete require.cache[configPath];

  process.env.APP_ENV = appEnv;
  process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.ingest.sentry.io/123';
  process.env.SENTRY_ORG = 'example-org';
  process.env.SENTRY_PROJECT = 'example-project';
  process.env.SENTRY_AUTH_TOKEN = 'example-token';

  try {
    const createConfig = require('../app.config.js') as (args: { config: object }) => any;
    return createConfig({ config: {} });
  } finally {
    process.env = originalEnv;
    delete require.cache[configPath];
  }
}

describe('Expo app config', () => {
  it('gives development builds a distinct launcher name', () => {
    expect(loadDynamicExpoConfig('development').name).toBe('Pawify Dev');
    expect(loadDynamicExpoConfig('production').name).toBe('Pawify');
    expect(loadDynamicExpoConfig('e2e-test').name).toBe('Pawify');
  });

  it('keeps the splash dark without forcing the launcher icon onto a dark plate', () => {
    const splashPlugin = appConfig.expo.plugins.find(plugin => (
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
    ));

    const splashOptions = Array.isArray(splashPlugin) && splashPlugin[0] === 'expo-splash-screen'
      ? splashPlugin[1]
      : undefined;

    expect(splashPlugin).toBeDefined();
    expect(
      typeof splashOptions === 'object' && splashOptions !== null && 'backgroundColor' in splashOptions
        ? splashOptions.backgroundColor
        : undefined
    )
      .toBe(SPLASH_BACKGROUND_COLOR);
    expect(appConfig.expo.android.adaptiveIcon.foregroundImage).toBe('./assets/icon.png');
    expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe(LAUNCHER_BACKGROUND_COLOR);
  });

  it('keeps local e2e builds emulator-friendly and skips Sentry plugin injection', () => {
    const config = loadDynamicExpoConfig('e2e-test');

    expect(config.extra.appEnv).toBe('e2e-test');
    expect(config.android.package).toBe('vip.chi_chi.pawify');
    expect(config.android.googleServicesFile).toBe('./google-services.development.json');
    expect(config.android.usesCleartextTraffic).toBe(true);
    expect(config.plugins).toContain('./plugins/expo-e2e-cleartext-plugin');
    expect(config.plugins).not.toContain('@sentry/react-native/expo');
  });
});

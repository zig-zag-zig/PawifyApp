import Constants from 'expo-constants';
import googleServices from '../../google-services.json';
import { getFirebaseAuthEmulatorUrl } from './firebaseEmulator';
import {
  parseFloatEnv,
  parseNumberEnv,
  parseBooleanEnv,
  parseApiBaseUrl,
  parseApiVersion,
  parseOptionalGitHubRepoUrl,
  parseOptionalFirebaseProjectId,
} from './envParsing';

function getRequiredEnv(name: string): string {
  const value = rawEnv[name as keyof typeof rawEnv];
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }

  return trimmed;
}

function getRequiredConfigValue(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`[config] Missing required value: ${name}`);
  }

  return trimmed;
}

function resolveAppVersion(): string {
  const constants = Constants as typeof Constants & { nativeAppVersion?: string | null };
  return constants.nativeAppVersion || Constants.expoConfig?.version || '1.0.0';
}

function resolveApiVersionFallback(): string {
  const appVersion = resolveAppVersion().trim();
  const major = appVersion.match(/^(\d+)\./)?.[1];
  if (!major || major === '0') {
    throw new Error(`[env] App version must start with a positive major version to derive API version, got "${appVersion}"`);
  }

  return `v${major}`;
}

function parseOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function parseOptionalUrl(value: string | undefined, name: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error(`[env] ${name} must be a valid https URL`);
  }
}

function resolveExtraValue(name: string): string | null {
  const extra = Constants.expoConfig?.extra;
  if (!extra || typeof extra !== 'object') {
    return null;
  }

  const value = (extra as Record<string, unknown>)[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const rawEnv = {
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_API_VERSION: process.env.EXPO_PUBLIC_API_VERSION,
  EXPO_PUBLIC_ARTIST_DIAGNOSTICS: process.env.EXPO_PUBLIC_ARTIST_DIAGNOSTICS,
  EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
  EXPO_PUBLIC_SENTRY_ENABLED: process.env.EXPO_PUBLIC_SENTRY_ENABLED,
  EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  EXPO_PUBLIC_TASK_NOTIFICATION_WAIT_MS: process.env.EXPO_PUBLIC_TASK_NOTIFICATION_WAIT_MS,
  EXPO_PUBLIC_TASK_POLL_INTERVAL_MS: process.env.EXPO_PUBLIC_TASK_POLL_INTERVAL_MS,
  EXPO_PUBLIC_TASK_TIMEOUT_MS: process.env.EXPO_PUBLIC_TASK_TIMEOUT_MS,
  EXPO_PUBLIC_IMAGE_CACHE_TIMEOUT_MAX_RETRIES: process.env.EXPO_PUBLIC_IMAGE_CACHE_TIMEOUT_MAX_RETRIES,
  EXPO_PUBLIC_IMAGE_CACHE_TIMEOUT_RETRY_BASE_DELAY_MS: process.env.EXPO_PUBLIC_IMAGE_CACHE_TIMEOUT_RETRY_BASE_DELAY_MS,
  EXPO_PUBLIC_IMAGE_REMOTE_RELOAD_RETRY_DELAY_MS: process.env.EXPO_PUBLIC_IMAGE_REMOTE_RELOAD_RETRY_DELAY_MS,
  EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL: process.env.EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL,
  EXPO_PUBLIC_UPDATE_GITHUB_TOKEN: process.env.EXPO_PUBLIC_UPDATE_GITHUB_TOKEN,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};

const googleWebClientId = getRequiredConfigValue(
  rawEnv.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  ?? googleServices.client[0].oauth_client.find((oauthClient) => oauthClient.client_type === 3)?.client_id,
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID or google-services.json client[0].oauth_client[client_type=3].client_id',
);
const sentryDsn = parseOptionalUrl(rawEnv.EXPO_PUBLIC_SENTRY_DSN, 'EXPO_PUBLIC_SENTRY_DSN');
const appEnv = resolveExtraValue('appEnv') ?? (__DEV__ ? 'development' : 'production');

export const ENV = {
  apiBaseUrl: parseApiBaseUrl(getRequiredEnv('EXPO_PUBLIC_API_BASE_URL')),
  apiVersion: parseApiVersion(rawEnv.EXPO_PUBLIC_API_VERSION, resolveApiVersionFallback()),
  appBuildVersion: Constants.nativeBuildVersion ?? null,
  appEnv,
  appVersion: resolveAppVersion(),
  googleWebClientId,
  artistDiagnosticsEnabled: parseBooleanEnv(rawEnv.EXPO_PUBLIC_ARTIST_DIAGNOSTICS, false),
  firebaseAuthEmulatorUrl: getFirebaseAuthEmulatorUrl(rawEnv.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST, appEnv),
  firebaseProjectId: parseOptionalFirebaseProjectId(rawEnv.EXPO_PUBLIC_FIREBASE_PROJECT_ID, appEnv),
  sentryDsn,
  sentryEnabled: Boolean(sentryDsn) && parseBooleanEnv(rawEnv.EXPO_PUBLIC_SENTRY_ENABLED, true),
  sentryTracesSampleRate: parseFloatEnv(rawEnv.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, 0, 0, 1),
  taskResultNotificationWaitMs: parseNumberEnv(rawEnv.EXPO_PUBLIC_TASK_NOTIFICATION_WAIT_MS, 30000, 0),
  taskResultPollIntervalMs: parseNumberEnv(rawEnv.EXPO_PUBLIC_TASK_POLL_INTERVAL_MS, 10000, 1000),
  taskResultTimeoutMs: parseNumberEnv(rawEnv.EXPO_PUBLIC_TASK_TIMEOUT_MS, 120000, 0),
  imageCacheTimeoutMaxRetries: parseNumberEnv(rawEnv.EXPO_PUBLIC_IMAGE_CACHE_TIMEOUT_MAX_RETRIES, 3, 0),
  imageCacheTimeoutRetryBaseDelayMs: parseNumberEnv(rawEnv.EXPO_PUBLIC_IMAGE_CACHE_TIMEOUT_RETRY_BASE_DELAY_MS, 300, 0),
  imageRemoteReloadRetryDelayMs: parseNumberEnv(rawEnv.EXPO_PUBLIC_IMAGE_REMOTE_RELOAD_RETRY_DELAY_MS, 250, 0),
  updateGithubRepoUrl: parseOptionalGitHubRepoUrl(rawEnv.EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL),
  updateGithubToken: parseOptionalString(rawEnv.EXPO_PUBLIC_UPDATE_GITHUB_TOKEN),
};

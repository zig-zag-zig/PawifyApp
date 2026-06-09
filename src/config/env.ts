import Constants from 'expo-constants';
import googleServices from '../../google-services.json';
import { getFirebaseAuthEmulatorUrl } from './firebaseEmulator';

function parseNumberEnv(value: string | undefined, fallback: number, min = 0): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

function parseFloatEnv(value: string | undefined, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

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

function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function parseApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('[env] EXPO_PUBLIC_API_BASE_URL must start with http:// or https://');
  }

  return ensureTrailingSlash(trimmed);
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

function parseApiVersion(value: string | undefined, fallback = 'v1'): string {
  let normalized = value?.trim() || fallback;
  normalized = normalized.replace(/^\/+|\/+$/g, '').toLowerCase();

  if (/^\d+$/.test(normalized)) {
    normalized = `v${normalized}`;
  }

  if (!/^v[1-9]\d*$/.test(normalized)) {
    throw new Error('[env] EXPO_PUBLIC_API_VERSION must look like v1, v2, etc.');
  }

  return normalized;
}

function parseOptionalGitHubRepoUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must be a valid GitHub repository URL');
  }

  if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must start with https://github.com/');
  }

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  const [owner, rawRepo] = pathParts;
  const repo = rawRepo?.replace(/\.git$/i, '');
  if (!owner || !repo || pathParts.length < 2) {
    throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must include owner and repo');
  }

  return `https://github.com/${owner}/${repo}`;
}

function parseOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function parseOptionalFirebaseProjectId(value: string | undefined, appEnv: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (appEnv === 'production') {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_PROJECT_ID cannot be set for production builds');
  }

  if (!/^[a-z][a-z0-9-]{4,29}$/i.test(trimmed)) {
    throw new Error('[env] EXPO_PUBLIC_FIREBASE_PROJECT_ID must be a valid Firebase project id');
  }

  return trimmed;
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

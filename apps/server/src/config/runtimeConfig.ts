import { parseFloatEnv, parseBooleanEnv, parsePositiveIntEnv } from './envParsing.js';

type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

const optionalEnv = (name: string): string | undefined => {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
};

const runtimeEnvironment = optionalEnv('APP_ENV') ?? optionalEnv('NODE_ENV') ?? 'development';

export const serverConfig = {
    port: parsePositiveIntEnv(process.env.PORT, 10000),
    requestBodyLimit: optionalEnv('REQUEST_BODY_LIMIT') ?? '5mb',
};

export const backgroundTaskConfig = {
    resultRetentionMs: parsePositiveIntEnv(process.env.BACKGROUND_TASK_RESULT_RETENTION_MS, 60_000),
    cleanupIntervalMs: parsePositiveIntEnv(process.env.BACKGROUND_TASK_CLEANUP_INTERVAL_MS, 20_000),
    maxConcurrency: parsePositiveIntEnv(process.env.BACKGROUND_TASK_MAX_CONCURRENCY, 8),
    pendingOrphanTtlMs: parsePositiveIntEnv(
        process.env.BACKGROUND_TASK_PENDING_ORPHAN_TTL_MS,
        10 * 60_000,
    ),
    workerTimeoutMs: parsePositiveIntEnv(process.env.BACKGROUND_TASK_WORKER_TIMEOUT_MS, 5 * 60_000),
    subtaskItemLimit: parsePositiveIntEnv(process.env.BACKGROUND_TASK_SUBTASK_ITEM_LIMIT, 30),
    progressNotificationThrottleMs: parsePositiveIntEnv(
        process.env.BACKGROUND_TASK_PROGRESS_NOTIFY_THROTTLE_MS,
        2_000,
    ),
};

export const backgroundTaskWorkerConfig = {
    coverArtRequestConcurrency: parsePositiveIntEnv(
        process.env.BACKGROUND_TASK_COVER_ART_REQUEST_CONCURRENCY,
        40,
    ),
    trackLyricsRequestConcurrency: parsePositiveIntEnv(
        process.env.BACKGROUND_TASK_TRACK_LYRICS_REQUEST_CONCURRENCY,
        20,
    ),
    artistProfileImageRequestConcurrency: parsePositiveIntEnv(
        process.env.BACKGROUND_TASK_ARTIST_PROFILE_IMAGE_REQUEST_CONCURRENCY,
        10,
    ),
};

export const cacheConfig = {
    defaultTtlHours: parsePositiveIntEnv(process.env.CACHE_DEFAULT_TTL_HOURS, 24 * 14),
    artistTtlHours: parsePositiveIntEnv(process.env.ARTIST_CACHE_TTL_HOURS, 24 * 61),
    transientArtistTtlHours: parsePositiveIntEnv(process.env.TRANSIENT_ARTIST_CACHE_TTL_HOURS, 24),
    releaseLyricsTtlHours: parsePositiveIntEnv(process.env.RELEASE_LYRICS_CACHE_TTL_HOURS, 24 * 14),
    artistMetadataRefreshTtlMs: parsePositiveIntEnv(
        process.env.ARTIST_METADATA_REFRESH_TTL_MS,
        1000 * 60 * 60 * 24 * 28,
    ),
    transientRemoteValueRetryWindowMs: parsePositiveIntEnv(
        process.env.TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
        1000 * 60 * 5,
    ),
};

export const musicApiConfig = {
    musicBrainzUserAgent: optionalEnv('MUSICBRAINZ_USER_AGENT') ?? 'MusicReleaseNotifier/1.0',
    musicBrainzDelayMs: parsePositiveIntEnv(process.env.MUSICBRAINZ_DELAY_MS, 650),
    musicBrainzBackgroundDelayMs: parsePositiveIntEnv(
        process.env.MUSICBRAINZ_BACKGROUND_DELAY_MS,
        1250,
    ),
    musicBrainzMinRateLimitWaitMs: parsePositiveIntEnv(
        process.env.MUSICBRAINZ_MIN_RATE_LIMIT_WAIT_MS,
        1500,
    ),
    musicBrainzRetryAfterBufferMs: parsePositiveIntEnv(
        process.env.MUSICBRAINZ_RETRY_AFTER_BUFFER_MS,
        1000,
    ),
};

export const notificationConfig = {
    notifyApiKey: optionalEnv('NOTIFY_API_KEY'),
    notifyNewReleasesLockTtlMs: parsePositiveIntEnv(
        process.env.NOTIFY_NEW_RELEASES_LOCK_TTL_MS,
        6 * 60 * 60 * 1000,
    ),
};

const parseLogLevelEnv = (value: string | undefined): RuntimeLogLevel => {
    const normalized = value?.trim().toLowerCase();
    return normalized === 'debug' ||
        normalized === 'info' ||
        normalized === 'warn' ||
        normalized === 'error'
        ? normalized
        : 'info';
};

export const loggingConfig: {
    level: RuntimeLogLevel;
    includeErrorStacks: boolean;
} = {
    level: parseLogLevelEnv(optionalEnv('LOG_LEVEL')),
    includeErrorStacks: parseBooleanEnv(process.env.LOG_ERROR_STACKS, false),
};

export const monitoringConfig = {
    appEnv: runtimeEnvironment,
    sentryDsn: optionalEnv('SENTRY_DSN'),
    sentryEnabled: parseBooleanEnv(process.env.SENTRY_ENABLED, true),
    sentryEnvironment: optionalEnv('SENTRY_ENVIRONMENT') ?? runtimeEnvironment,
    sentryRelease: optionalEnv('SENTRY_RELEASE'),
    sentryTracesSampleRate: parseFloatEnv(process.env.SENTRY_TRACES_SAMPLE_RATE, 0, 0, 1),
};

/**
 * Resolve the password-reset OTP pepper from env. Exported for unit testing.
 * In production, an empty/missing pepper throws (fail-fast) unless explicitly
 * bypassed with ALLOW_INSECURE_PASSWORD_RESET_PEPPER=true.
 */
export const resolvePasswordResetPepper = (
    pepper: string | undefined,
    allowInsecure: string | undefined,
    production: boolean,
): string => {
    const trimmed = pepper?.trim();
    if (trimmed) {
        return trimmed;
    }
    if (allowInsecure === 'true') {
        return 'insecure-dev-pepper';
    }
    if (production) {
        throw new Error(
            'PASSWORD_RESET_PEPPER is required in production. Set ALLOW_INSECURE_PASSWORD_RESET_PEPPER=true to bypass.',
        );
    }
    return 'insecure-dev-pepper';
};

const isProduction = runtimeEnvironment === 'production';

export const securityConfig = {
    passwordResetPepper: resolvePasswordResetPepper(
        process.env.PASSWORD_RESET_PEPPER,
        process.env.ALLOW_INSECURE_PASSWORD_RESET_PEPPER,
        isProduction,
    ),
};

export const firebaseAdminConfig = {
    serviceAccountJson: optionalEnv('FIREBASE_SERVICE_ACCOUNT_JSON'),
    credentialsFilePath: optionalEnv('GOOGLE_APPLICATION_CREDENTIALS'),
    databaseURL: optionalEnv('FIREBASE_DATABASE_URL'),
};

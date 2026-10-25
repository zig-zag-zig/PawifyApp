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
    // New-release scan cache: short on purpose. It only exists to dedupe
    // per-artist MusicBrainz fetches *within* one notification run (and across
    // closely-spaced runs), so it must expire well before the next scan.
    releaseScanTtlHours: parsePositiveIntEnv(process.env.RELEASE_SCAN_CACHE_TTL_HOURS, 2),
    maxIndividualReleaseNotifications: parsePositiveIntEnv(
        process.env.MAX_INDIVIDUAL_RELEASE_NOTIFICATIONS,
        3,
    ),
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
    // MusicBrainz sends no Retry-After, so this is the floor applied when it
    // answers 429/503: long enough to clear a momentary blip, short enough that a
    // single 503 does not stall foreground lookups. Sustained throttling is
    // handled by the Dapr circuit breaker rather than by a long pause here.
    musicBrainzMinRateLimitWaitMs: parsePositiveIntEnv(
        process.env.MUSICBRAINZ_MIN_RATE_LIMIT_WAIT_MS,
        1500,
    ),
    musicBrainzRetryAfterBufferMs: parsePositiveIntEnv(
        process.env.MUSICBRAINZ_RETRY_AFTER_BUFFER_MS,
        1000,
    ),
    // Tidal artist lookups need a token and a country. Both are overridable here;
    // see credentials.getTidalToken for the full precedence order.
    tidalApiToken: optionalEnv('TIDAL_API_TOKEN'),
    tidalCountryCode: optionalEnv('TIDAL_COUNTRY_CODE') ?? 'US',
    // Retained for the in-memory fallback limiter only. The MusicBrainz request
    // budget itself is governed by rateLimitConfig's token bucket below.
    musicBrainzDelayMs: parsePositiveIntEnv(process.env.MUSICBRAINZ_DELAY_MS, 650),
};

/**
 * Shared (Dapr state) token-bucket limits for providers whose quota is per IP or
 * per token, so the budget is enforced across every server instance.
 *
 * Defaults are set below the provider's documented limit to leave headroom:
 * - musicbrainz: documented and enforced at 1 req/sec average per IP. Bursting was
 *   measured to be unreliable: the same 5-request burst returned 200 on one run and
 *   503 on another, and MusicBrainz then declines every request until the average
 *   drops back to 1/sec. Each 503 also costs a ~10s pause, which stalled whole
 *   batches and left artists without images. Burst therefore defaults to 1 (strict
 *   1/sec, matching the published policy). Raise RATE_LIMIT_MUSICBRAINZ_BURST via
 *   env to experiment; no code change needed.
 * - discogs: 60 req/min authenticated (verified from x-discogs-ratelimit).
 * - deezer: 50 req/5s per IP (verified; exceeding it returns HTTP 200 with
 *   error code 4). 8/sec runs at ~80% of the documented budget.
 */
export const rateLimitConfig = {
    musicbrainzBurst: parsePositiveIntEnv(process.env.RATE_LIMIT_MUSICBRAINZ_BURST, 1),
    musicbrainzRefillPerSecond: parsePositiveIntEnv(
        process.env.RATE_LIMIT_MUSICBRAINZ_REFILL_PER_SECOND,
        1,
    ),
    musicbrainzStaggerMs: parsePositiveIntEnv(process.env.RATE_LIMIT_MUSICBRAINZ_STAGGER_MS, 50),

    discogsBurst: parsePositiveIntEnv(process.env.RATE_LIMIT_DISCOGS_BURST, 5),
    discogsRefillPerSecond: parsePositiveIntEnv(
        process.env.RATE_LIMIT_DISCOGS_REFILL_PER_SECOND,
        1,
    ),
    discogsStaggerMs: parsePositiveIntEnv(process.env.RATE_LIMIT_DISCOGS_STAGGER_MS, 50),

    deezerBurst: parsePositiveIntEnv(process.env.RATE_LIMIT_DEEZER_BURST, 40),
    deezerRefillPerSecond: parsePositiveIntEnv(process.env.RATE_LIMIT_DEEZER_REFILL_PER_SECOND, 8),
    deezerStaggerMs: parsePositiveIntEnv(process.env.RATE_LIMIT_DEEZER_STAGGER_MS, 0),

    // Longest provider-requested pause we are willing to sit through. This has to
    // cover Discogs' documented 60s window, so anything beyond a minute is treated
    // as "not worth waiting" and fails fast as transient instead of blocking the
    // shared bucket. Minutes-long resets used to stall whole batches.
    maxBackoffWaitMs: parsePositiveIntEnv(process.env.RATE_LIMIT_MAX_BACKOFF_WAIT_MS, 60_000),
    // Bucket state lives in Dapr state; when it cannot be reached the limiter
    // falls back to per-process limits instead of failing the request.
    stateStoreName: optionalEnv('RATE_LIMIT_STATE_STORE') ?? 'pawify-state',
    fallbackMaxConcurrent: parsePositiveIntEnv(process.env.RATE_LIMIT_FALLBACK_MAX_CONCURRENT, 1),
    fallbackDelayMs: parsePositiveIntEnv(process.env.RATE_LIMIT_FALLBACK_DELAY_MS, 1000),
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

import {
    parseFloatEnv,
    parseBooleanEnv,
    parseNonNegativeIntEnv,
    parsePositiveIntEnv,
} from './envParsing.js';

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
    // Measured on a 60-group artist page against Cover Art Archive: 40 in flight
    // took 4.81 s, 80 took 2.62 s. These are latency-bound HEADs, not a metered API
    // quota, so raising the bound is what makes a cold page land in one wave.
    coverArtRequestConcurrency: parsePositiveIntEnv(
        process.env.BACKGROUND_TASK_COVER_ART_REQUEST_CONCURRENCY,
        80,
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
    // Provider artwork/lyrics: a month of success, a week of "definitely absent".
    // Covers change independently of MusicBrainz (a provider can replace artwork),
    // so they do not inherit the 61-day artist-metadata TTL.
    assetSuccessTtlHours: parsePositiveIntEnv(process.env.ASSET_CACHE_SUCCESS_TTL_HOURS, 24 * 30),
    assetMissTtlHours: parsePositiveIntEnv(process.env.ASSET_CACHE_MISS_TTL_HOURS, 24 * 7),
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
 * - deezer: 50 req/5s per IP (measured 2026-11-07: 45 requests at concurrency 40
 *   all succeeded before the first quota error). The reply is HTTP 200 with
 *   `{"error":{"code":4}}` and carries no rate-limit headers at all, so the
 *   bucket cannot learn a reset time and simply must stay under the window.
 *   Worst case for any 5s window is `burst + 5 * refill`, so 10 + 5*6 = 40
 *   requests, i.e. 80% of the measured budget. The previous 8/s refill allowed
 *   10 + 40 = 50, exactly 100% of the budget, which is why cold-cache bursts
 *   tripped it.
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

    // Deezer allows 50 requests per 5s per IP. Worst case for a 5s window is
    // burst + 5*refill, so 10 + 5*6 = 40 keeps 20% headroom. The previous 8/s
    // refill allowed exactly 50 and tripped the quota on cold-cache fills.
    deezerBurst: parsePositiveIntEnv(process.env.RATE_LIMIT_DEEZER_BURST, 10),
    deezerRefillPerSecond: parsePositiveIntEnv(process.env.RATE_LIMIT_DEEZER_REFILL_PER_SECOND, 6),
    deezerStaggerMs: parsePositiveIntEnv(process.env.RATE_LIMIT_DEEZER_STAGGER_MS, 0),

    // Tidal publishes no rate-limit headers, and a 429 blocks the shared token for
    // minutes. Measured 2026-11-07: 10 req/s sustained for 10s and 20 req/s
    // sustained for 10s both completed with zero 429s; 40 req/s tripped it after
    // ~103 requests. 10 req/s is 50% of the fastest known-safe rate.
    // parsePositiveIntEnv rejects 0, so delayMs uses its own non-negative parse.
    tidalMaxConcurrent: parsePositiveIntEnv(process.env.RATE_LIMIT_TIDAL_MAX_CONCURRENT, 3),
    tidalDelayMs: parseNonNegativeIntEnv(process.env.RATE_LIMIT_TIDAL_DELAY_MS, 100),

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

/**
 * Local MusicBrainz mirror (SQLite), produced by zig-zag-zig/pawify_mb_sqlite.
 *
 * The mirror is the source of truth for artist and release metadata; there is no
 * "use the API instead" switch, because running both paths is a cost with no user
 * benefit. The API stays as a *failure* path only: if the file is missing or cannot
 * be opened, requests are served from the API and an error is logged, so a broken
 * sync job degrades the app instead of taking it down. Tracklists always come from
 * the API because the mirror stores none.
 */
export const musicDbConfig = {
    // Resolved on access: the mirror client is a lazily opened singleton and tests
    // point a process at a fixture without controlling import order.
    get path(): string | undefined {
        return optionalEnv('MUSIC_DB_PATH');
    },
    /**
     * Hard upper bound on release groups returned for one artist.
     *
     * "Every release group of this artist" is cheap to query but not free: Various
     * Artists has 297k groups / 336k releases and building that page killed the
     * process with a JavaScript heap OOM (measured). The endpoint has no pagination
     * contract yet, so the bound lives here; 0 disables it.
     */
    get maxArtistReleaseGroups(): number {
        return parseNonNegativeIntEnv(process.env.MUSIC_DB_MAX_ARTIST_RELEASE_GROUPS, 1000);
    },
};
import { musicApiConfig, rateLimitConfig } from '../../config/runtimeConfig.js';
import { createLogger } from '../../common/logging/logger.js';
import { GlobalTokenBucket } from './globalTokenBucket.js';
import type { MusicBrainzPriority } from './types.js';

const logger = createLogger('services.musicApi.rateLimit');

export type ExternalService =
    | 'musicbrainz'
    | 'coverartarchive'
    | 'discogs'
    | 'genius'
    | 'expo'
    | 'deezer'
    | 'deezerimages'
    | 'tidal'
    | 'tidalimages'
    | 'other';

// Node clamps setTimeout delays above 2^31 - 1 ms to 1 ms, which turns an
// oversized wait into a tight timer storm. Never schedule beyond this.
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const RATE_LIMIT_CONFIG = {
    // Default pool for services without a dedicated limiter below (expo, other).
    // MusicBrainz, Discogs and Deezer use the shared token buckets instead.
    default: { maxConcurrent: 1, delayMs: musicApiConfig.musicBrainzDelayMs },
    genius: { maxConcurrent: 30, delayMs: 0 },
    coverartarchive: { maxConcurrent: 40, delayMs: 0 },
    // The Tidal API is reached with a shared community token, so serialize it.
    // The Tidal API is reached with a shared community token. Measured headroom
    // is high (76 req/sec returned no 429s), but the token is not ours, so this
    // stays deliberately modest while still allowing more than one call in
    // flight. One-at-a-time serialized every Tidal fallback in a batch.
    tidal: { maxConcurrent: 3, delayMs: 50 },
    // Artwork HEAD probes hit resources.tidal.com, a different host with its own
    // limits. A separate pool stops them queueing behind artist API calls.
    tidalimages: { maxConcurrent: 5, delayMs: 0 },
    // Deezer artwork probes hit cdn-images.dzcdn.net, another separate host.
    deezerimages: { maxConcurrent: 10, delayMs: 0 },
};

export class RateLimiter {
    maxConcurrent: number;
    delayMs: number;
    queue: Array<() => void>;
    activeRequests: number;
    lastDispatchTime: number;
    processing: boolean;
    backoffUntil: number;
    /** Mirrors GlobalTokenBucket's shared timestamp; unused by this in-memory pool. */
    lastDispatchAt = 0;
    pendingTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(maxConcurrent: number, delayMs: number) {
        this.maxConcurrent = maxConcurrent;
        this.delayMs = delayMs;
        this.queue = [];
        this.activeRequests = 0;
        this.lastDispatchTime = 0;
        this.processing = false;
        this.backoffUntil = 0;
        this.pendingTimer = undefined;
    }

    async acquire(): Promise<() => void> {
        return new Promise<() => void>((resolve) => {
            this.queue.push(() => {
                resolve(() => this.release());
            });
            if (!this.processing) {
                this.processQueue();
            }
        });
    }

    private release() {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
        this.scheduleProcessQueue(10);
    }

    setBackoff(ms: number) {
        // Concurrent responses can finish out of order; never let a shorter
        // remaining wait override a longer deadline already in effect.
        this.backoffUntil = Math.max(this.backoffUntil, Date.now() + ms);
    }

    /** Mirrors GlobalTokenBucket.setLocalBackoff; this pool is already per-process. */
    setLocalBackoff(ms: number) {
        this.setBackoff(ms);
    }

    processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        if (Date.now() < this.backoffUntil) {
            this.processing = true;
            this.scheduleProcessQueue(this.backoffUntil - Date.now());
            return;
        }

        this.processing = true;
        const now = Date.now();
        const timeSinceLastDispatch = now - this.lastDispatchTime;

        if (this.activeRequests >= this.maxConcurrent) {
            this.scheduleProcessQueue(50);
            return;
        }

        if (timeSinceLastDispatch < this.delayMs) {
            this.scheduleProcessQueue(this.delayMs - timeSinceLastDispatch);
            return;
        }

        this.activeRequests++;
        this.lastDispatchTime = now;
        const next = this.queue.shift();
        if (next) next();

        if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            this.scheduleProcessQueue(this.delayMs);
        } else {
            this.processing = false;
        }
    }

    private scheduleProcessQueue(delayMs: number) {
        if (this.pendingTimer !== undefined) {
            clearTimeout(this.pendingTimer);
        }
        this.pendingTimer = setTimeout(
            () => {
                this.pendingTimer = undefined;
                this.processQueue();
            },
            Math.min(delayMs, MAX_TIMEOUT_MS),
        );
    }
}

type RateLimitedLimiter = RateLimiter | GlobalTokenBucket;

/**
 * Builds one shared token bucket.
 *
 * The in-memory RateLimiter is kept as the bucket's fallback: if Dapr state is
 * unreachable the limiter keeps working per-process instead of blocking every
 * request to the provider.
 */
const createGlobalBucket = (
    provider: 'musicbrainz' | 'discogs' | 'deezer',
    capacity: number,
    refillPerSecond: number,
    staggerMs: number,
): GlobalTokenBucket =>
    new GlobalTokenBucket({
        key: `rate_limit:${provider}`,
        capacity,
        refillPerSecond,
        staggerMs,
        maxWaitMs: 1000,
        stateStoreName: rateLimitConfig.stateStoreName,
        maxBackoffWaitMs: rateLimitConfig.maxBackoffWaitMs,
        fallback: new RateLimiter(
            rateLimitConfig.fallbackMaxConcurrent,
            rateLimitConfig.fallbackDelayMs,
        ),
    });

const rateLimiters = {
    // Shared buckets. One budget for the whole deployment, so adding a second
    // server cannot double the request rate seen by the provider.
    musicbrainz: createGlobalBucket(
        'musicbrainz',
        rateLimitConfig.musicbrainzBurst,
        rateLimitConfig.musicbrainzRefillPerSecond,
        rateLimitConfig.musicbrainzStaggerMs,
    ),
    discogs: createGlobalBucket(
        'discogs',
        rateLimitConfig.discogsBurst,
        rateLimitConfig.discogsRefillPerSecond,
        rateLimitConfig.discogsStaggerMs,
    ),
    deezer: createGlobalBucket(
        'deezer',
        rateLimitConfig.deezerBurst,
        rateLimitConfig.deezerRefillPerSecond,
        rateLimitConfig.deezerStaggerMs,
    ),
    genius: new RateLimiter(
        RATE_LIMIT_CONFIG.genius.maxConcurrent,
        RATE_LIMIT_CONFIG.genius.delayMs,
    ),
    coverartarchive: new RateLimiter(
        RATE_LIMIT_CONFIG.coverartarchive.maxConcurrent,
        RATE_LIMIT_CONFIG.coverartarchive.delayMs,
    ),
    deezerimages: new RateLimiter(
        RATE_LIMIT_CONFIG.deezerimages.maxConcurrent,
        RATE_LIMIT_CONFIG.deezerimages.delayMs,
    ),
    tidal: new RateLimiter(RATE_LIMIT_CONFIG.tidal.maxConcurrent, RATE_LIMIT_CONFIG.tidal.delayMs),
    tidalimages: new RateLimiter(
        RATE_LIMIT_CONFIG.tidalimages.maxConcurrent,
        RATE_LIMIT_CONFIG.tidalimages.delayMs,
    ),
    default: new RateLimiter(
        RATE_LIMIT_CONFIG.default.maxConcurrent,
        RATE_LIMIT_CONFIG.default.delayMs,
    ),
};

const SERVICE_RATE_LIMITERS: Partial<Record<ExternalService, RateLimitedLimiter>> = {
    coverartarchive: rateLimiters.coverartarchive,
    discogs: rateLimiters.discogs,
    genius: rateLimiters.genius,
    deezer: rateLimiters.deezer,
    deezerimages: rateLimiters.deezerimages,
    tidal: rateLimiters.tidal,
    tidalimages: rateLimiters.tidalimages,
};

export const getRateLimiter = (
    service: ExternalService,
    priority: MusicBrainzPriority = 'foreground',
): RateLimitedLimiter => {
    if (service === 'musicbrainz') {
        // Foreground and background draw from one provider budget, because the
        // provider limits by IP rather than per request class. The `priority`
        // argument is still accepted so call sites stay unchanged; ordering is
        // enforced by httpClient's foreground drain, so UI traffic keeps priority.
        return rateLimiters.musicbrainz;
    }
    return SERVICE_RATE_LIMITERS[service] ?? rateLimiters.default;
};

const isMusicBrainzRateLimitedStatus = (status: number): boolean =>
    status === 429 || status === 503;

// `x-ratelimit-reset` does not mean the same thing everywhere: MusicBrainz sends
// an absolute Unix epoch in seconds, Genius a countdown in seconds, and Discogs
// documents no reset header at all. Treating every value as an epoch silently
// disabled backoff for Genius (a countdown of 77655 became 1970), so the
// interpretation is per service.
type ResetSemantics = 'absolute-epoch-seconds' | 'relative-seconds';

const RESET_SEMANTICS: Partial<Record<ExternalService, ResetSemantics>> = {
    musicbrainz: 'absolute-epoch-seconds',
    genius: 'relative-seconds',
};

/**
 * Documented window to wait when a provider reports zero remaining quota but
 * publishes no reset time. Discogs: "Our rate limiting tracks your requests
 * using a moving average over a 60 second window. If no requests are made in 60
 * seconds, your window will reset."
 */
const DOCUMENTED_EXHAUSTION_BACKOFF_MS: Partial<Record<ExternalService, number>> = {
    discogs: 60_000,
};

const resetWaitMs = (service: ExternalService, resetHeader: string | null): number => {
    const raw = Number.parseInt(resetHeader ?? '', 10);
    if (!Number.isFinite(raw) || raw <= 0) {
        return 0;
    }

    switch (RESET_SEMANTICS[service]) {
        case 'absolute-epoch-seconds': {
            const waitMs = raw * 1000 - Date.now();
            return waitMs > 0 ? waitMs : 0;
        }
        case 'relative-seconds':
            return raw * 1000;
        default:
            // No documented meaning: ignore rather than guess a duration.
            return 0;
    }
};

/**
 * Adds a backoff when a provider reports that the current window is exhausted.
 *
 * A wait derived from a reset header is a fresh fact, so a longer one always
 * wins. The documented-window fallback is different: it is a fixed cool-off, so
 * re-arming it from every response would push the deadline back each time a
 * concurrent request also reports exhaustion, making us wait far longer than
 * the window.
 */
const addRemainingBackoff = (
    service: ExternalService,
    limiter: { backoffUntil: number; lastDispatchAt?: number },
    remainingHeader: string | null,
    resetHeader: string | null,
    backoffMs: number,
): number => {
    const remaining = Number.parseInt(remainingHeader ?? '', 10);
    if (!Number.isFinite(remaining) || remaining > 0) {
        return backoffMs;
    }

    const headerWaitMs = resetWaitMs(service, resetHeader);
    if (headerWaitMs > 0) {
        return Math.max(backoffMs, headerWaitMs);
    }

    const documentedWaitMs = DOCUMENTED_EXHAUSTION_BACKOFF_MS[service] ?? 0;
    if (documentedWaitMs <= 0) {
        return backoffMs;
    }

    // Count the window from the last dispatched request rather than from now, so
    // a window that is nearly over is not waited out in full. The bucket records
    // that timestamp in shared state, so every instance agrees on it.
    const lastDispatchAt = limiter.lastDispatchAt ?? 0;
    const elapsed = lastDispatchAt > 0 ? Math.max(0, Date.now() - lastDispatchAt) : 0;
    const remainingWaitMs = documentedWaitMs - elapsed;
    if (remainingWaitMs <= 0) {
        return backoffMs;
    }

    // Do not re-arm a window that is already paused; concurrent responses would
    // otherwise push the deadline back on every reply.
    if (limiter.backoffUntil > Date.now()) {
        return backoffMs;
    }

    return Math.max(backoffMs, remainingWaitMs);
};

export const applyRateLimitHeaders = (
    response: Response,
    rateLimiter: RateLimitedLimiter,
    service: ExternalService,
): number => {
    let backoffMs = 0;

    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
        const retryAfterMsRaw = /^\d+$/.test(retryAfter) ? parseInt(retryAfter, 10) * 1000 : 0;
        const retryAfterMs =
            service === 'musicbrainz' && retryAfterMsRaw > 0
                ? retryAfterMsRaw + musicApiConfig.musicBrainzRetryAfterBufferMs
                : retryAfterMsRaw;
        if (retryAfterMs > 0) {
            backoffMs = Math.max(backoffMs, retryAfterMs);
        }
    }

    const discogsRemaining = response.headers.get('x-discogs-ratelimit-remaining');
    const discogsReset = response.headers.get('x-ratelimit-reset');
    backoffMs = addRemainingBackoff(
        'discogs',
        rateLimiter,
        discogsRemaining,
        discogsReset,
        backoffMs,
    );

    const genericRemaining = response.headers.get('x-ratelimit-remaining');
    const genericReset = response.headers.get('x-ratelimit-reset');
    backoffMs = addRemainingBackoff(
        service,
        rateLimiter,
        genericRemaining,
        genericReset,
        backoffMs,
    );

    if (service === 'musicbrainz' && isMusicBrainzRateLimitedStatus(response.status)) {
        backoffMs = Math.max(backoffMs, musicApiConfig.musicBrainzMinRateLimitWaitMs);
    }

    if (backoffMs > 0) {
        if (backoffMs > rateLimitConfig.maxBackoffWaitMs) {
            // A reset this far out is not worth pausing the shared bucket for: that
            // would hold every other request hostage. The response is already a
            // failure, so it becomes a transient miss and the caller retries later.
            logger.warn('provider asked for a long pause; failing fast instead', {
                service,
                status: response.status,
                backoffMs,
                maxBackoffWaitMs: rateLimitConfig.maxBackoffWaitMs,
            });
            // Do not block the fleet on this, but stop this instance from retrying
            // straight back into it.
            rateLimiter.setLocalBackoff(backoffMs);
            return backoffMs;
        }

        // Pausing the shared bucket is invisible otherwise, which makes a slow
        // batch look like a hang. Log it so a throttle can be told apart from
        // ordinary latency.
        logger.warn('pausing provider requests after a rate-limit response', {
            service,
            status: response.status,
            backoffMs,
        });
        rateLimiter.setBackoff(backoffMs);
    }

    return backoffMs;
};

/** True when a computed backoff is short enough to be worth waiting out. */
export const isBackoffWithinCap = (backoffMs: number): boolean =>
    backoffMs <= rateLimitConfig.maxBackoffWaitMs;

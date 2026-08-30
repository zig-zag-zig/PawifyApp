import { musicApiConfig } from '../../config/runtimeConfig.js';
import type { MusicBrainzPriority } from './types.js';

export type ExternalService =
    'musicbrainz' | 'coverartarchive' | 'discogs' | 'genius' | 'expo' | 'other';

// Node clamps setTimeout delays above 2^31 - 1 ms to 1 ms, which turns an
// oversized wait into a tight timer storm. Never schedule beyond this.
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const RATE_LIMIT_CONFIG = {
    musicbrainzForeground: { maxConcurrent: 1, delayMs: musicApiConfig.musicBrainzDelayMs },
    musicbrainzBackground: {
        maxConcurrent: 1,
        delayMs: musicApiConfig.musicBrainzBackgroundDelayMs,
    },
    discogs: { maxConcurrent: 10, delayMs: 0 },
    genius: { maxConcurrent: 30, delayMs: 0 },
    coverartarchive: { maxConcurrent: 40, delayMs: 0 },
};

export class RateLimiter {
    maxConcurrent: number;
    delayMs: number;
    queue: Array<() => void>;
    activeRequests: number;
    lastDispatchTime: number;
    processing: boolean;
    backoffUntil: number;
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

const rateLimiters = {
    musicbrainzForeground: new RateLimiter(
        RATE_LIMIT_CONFIG.musicbrainzForeground.maxConcurrent,
        RATE_LIMIT_CONFIG.musicbrainzForeground.delayMs,
    ),
    musicbrainzBackground: new RateLimiter(
        RATE_LIMIT_CONFIG.musicbrainzBackground.maxConcurrent,
        RATE_LIMIT_CONFIG.musicbrainzBackground.delayMs,
    ),
    discogs: new RateLimiter(
        RATE_LIMIT_CONFIG.discogs.maxConcurrent,
        RATE_LIMIT_CONFIG.discogs.delayMs,
    ),
    genius: new RateLimiter(
        RATE_LIMIT_CONFIG.genius.maxConcurrent,
        RATE_LIMIT_CONFIG.genius.delayMs,
    ),
    coverartarchive: new RateLimiter(
        RATE_LIMIT_CONFIG.coverartarchive.maxConcurrent,
        RATE_LIMIT_CONFIG.coverartarchive.delayMs,
    ),
};

export const getRateLimiter = (
    service: ExternalService,
    priority: MusicBrainzPriority = 'foreground',
) => {
    if (service === 'musicbrainz') {
        return priority === 'background'
            ? rateLimiters.musicbrainzBackground
            : rateLimiters.musicbrainzForeground;
    }
    if (service === 'discogs') return rateLimiters.discogs;
    if (service === 'genius') return rateLimiters.genius;
    if (service === 'coverartarchive') return rateLimiters.coverartarchive;
    return rateLimiters.musicbrainzForeground;
};

const isMusicBrainzRateLimitedStatus = (status: number): boolean =>
    status === 429 || status === 503;

// x-ratelimit-reset (Discogs, GitHub-style APIs) is an absolute Unix epoch in
// seconds: "the current window resets at this instant". Convert it into the
// remaining relative wait before merging it into the backoff duration.
const addResetHeaderBackoff = (
    remainingHeader: string | null,
    resetHeader: string | null,
    backoffMs: number,
): number => {
    if (remainingHeader === null || resetHeader === null) {
        return backoffMs;
    }

    const remaining = parseInt(remainingHeader, 10);
    const resetAtMs = parseInt(resetHeader, 10) * 1000;
    if (remaining <= 0 && resetAtMs > 0) {
        const waitMs = resetAtMs - Date.now();
        if (waitMs > 0) {
            backoffMs = Math.max(backoffMs, waitMs);
        }
    }

    return backoffMs;
};

export const applyRateLimitHeaders = (
    response: Response,
    rateLimiter: RateLimiter,
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
    backoffMs = addResetHeaderBackoff(discogsRemaining, discogsReset, backoffMs);

    const genericRemaining = response.headers.get('x-ratelimit-remaining');
    const genericReset = response.headers.get('x-ratelimit-reset');
    backoffMs = addResetHeaderBackoff(genericRemaining, genericReset, backoffMs);

    if (service === 'musicbrainz' && isMusicBrainzRateLimitedStatus(response.status)) {
        backoffMs = Math.max(backoffMs, musicApiConfig.musicBrainzMinRateLimitWaitMs);
    }

    if (backoffMs > 0) {
        rateLimiter.setBackoff(backoffMs);
    }

    return backoffMs;
};

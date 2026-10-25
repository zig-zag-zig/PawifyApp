import { createLogger } from '../../common/logging/logger.js';
import { getStateEntry, saveStateValueIfMatch } from '../../infrastructure/dapr/daprStateStore.js';
import { createAbortError, delayWithAbort } from './abortableDelay.js';

const logger = createLogger('services.musicApi.rateLimit');

/**
 * Minimal shape the bucket degrades to when the shared store is unreachable, so
 * rate limiting keeps working per-process instead of failing every request.
 */
export type LocalRateLimitFallback = {
    acquire(signal?: AbortSignal): Promise<() => void>;
};

export type GlobalTokenBucketConfig = {
    /** Dapr state key holding the bucket shared by every server instance. */
    key: string;
    /** Maximum burst size. */
    capacity: number;
    /** Tokens added per second: the sustained average rate. */
    refillPerSecond: number;
    /** Minimum spacing between two dispatches, reserved in shared state. */
    staggerMs: number;
    /** Upper bound on any single sleep, so state changes are picked up promptly. */
    maxWaitMs: number;
    /** Dapr state store holding the shared bucket. */
    stateStoreName?: string;
    /** Longest pause we will sit through; longer ones fail fast instead. */
    maxBackoffWaitMs: number;
    fallback: LocalRateLimitFallback;
};

type BucketState = {
    tokens: number;
    lastRefillAt: number;
    nextSlotAt: number;
    backoffUntil: number;
    /**
     * When a token was last handed out, shared across instances. Used to work out
     * how much of a provider's documented window (e.g. Discogs' 60s moving
     * average) has already elapsed, so we do not wait longer than needed.
     */
    lastDispatchAt: number;
};

type Reservation =
    | { kind: 'granted'; waitMs: number }
    | { kind: 'wait'; waitMs: number }
    | { kind: 'conflict' }
    | { kind: 'unavailable'; waitMs: number };

/**
 * Thrown when a provider asked us to wait longer than the configured cap.
 *
 * `fetchDaprProvider` turns a non-abort throw into a transient failure, so the
 * caller is marked "retry later" instead of blocking the batch for minutes.
 */
export class RateLimitUnavailableError extends Error {
    constructor(
        public readonly key: string,
        public readonly waitMs: number,
    ) {
        super(`rate limited for another ${waitMs}ms`);
        this.name = 'RateLimitUnavailableError';
    }
}

const clampWait = (ms: number, maxWaitMs: number): number =>
    Math.min(Math.max(Math.ceil(ms), 1), maxWaitMs);

/**
 * Token bucket whose state lives in the shared Dapr state store, so every server
 * instance draws from one budget.
 *
 * Dapr's Redis components expose key/value operations rather than arbitrary
 * commands, so there is no Lua EVAL path. Atomicity comes from ETag-based
 * compare-and-set instead: the bucket is read with its ETag, the refill and
 * decrement are computed locally, and the write only lands if nothing else
 * changed the key in between. A lost race is retried, which means exactly one
 * caller ever wins a given token.
 */
export class GlobalTokenBucket {
    private readonly config: GlobalTokenBucketConfig;
    /** Local mirror, so a backoff set before the first successful write still applies. */
    backoffUntil = 0;
    /** Shared timestamp of the last dispatched request, mirrored locally. */
    lastDispatchAt = 0;
    private fallbackWarned = false;

    constructor(config: GlobalTokenBucketConfig) {
        this.config = config;
    }

    /**
     * Reserves one token, waiting until the shared bucket allows it.
     *
     * Returns a release function to match the in-process limiter's call-site
     * contract; it is a no-op because a token bucket has no held slot to give
     * back once consumed.
     */
    async acquire(signal?: AbortSignal): Promise<() => void> {
        for (;;) {
            if (signal?.aborted) {
                throw createAbortError();
            }

            let reservation: Reservation;
            try {
                reservation = await this.tryReserve();
            } catch (error) {
                this.warnFallbackOnce(error);
                return await this.config.fallback.acquire(signal);
            }

            if (reservation.kind === 'granted') {
                if (reservation.waitMs > 0) {
                    await delayWithAbort(reservation.waitMs, signal);
                }
                return noopRelease;
            }

            // The provider asked for a pause longer than we are willing to hold the
            // batch for, so surface it as a transient failure instead of waiting.
            if (reservation.kind === 'unavailable') {
                throw new RateLimitUnavailableError(this.config.key, reservation.waitMs);
            }

            // A lost compare-and-set means another instance took the token; retry
            // immediately rather than sleeping, since the state is already stale.
            if (reservation.kind === 'conflict') {
                continue;
            }

            await delayWithAbort(clampWait(reservation.waitMs, this.config.maxWaitMs), signal);
        }
    }

    /**
     * Pauses the bucket for every instance, used when a provider answers 429/503
     * with a Retry-After so we stop adding load to an already-throttled upstream.
     */
    setBackoff(ms: number): void {
        const deadline = Date.now() + Math.max(0, ms);
        this.backoffUntil = Math.max(this.backoffUntil, deadline);
        // applyRateLimitHeaders is synchronous, so the shared write is best
        // effort; the local mirror keeps this instance correct either way.
        void this.publishBackoff(deadline).catch((error) => {
            this.warnFallbackOnce(error);
        });
    }

    /**
     * Pauses only this instance, without publishing to shared state.
     *
     * Used when a provider asks for a pause longer than the cap: we do not want to
     * block every other request in the fleet on it, but we do want this instance to
     * stop retrying into it.
     */
    setLocalBackoff(ms: number): void {
        this.backoffUntil = Math.max(this.backoffUntil, Date.now() + Math.max(0, ms));
    }

    private async publishBackoff(deadline: number): Promise<void> {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const { value, etag } = await getStateEntry(
                this.config.key,
                this.config.stateStoreName,
            );
            // Seed from 0, not from the local mirror: the local deadline is
            // already applied in-process, and seeding from it would make this
            // method believe shared state is current and skip the write.
            const state = this.parseState(value, Date.now(), 0);
            if (state.backoffUntil >= deadline) {
                return;
            }

            const saved = await saveStateValueIfMatch(
                this.config.key,
                JSON.stringify({ ...state, backoffUntil: deadline }),
                etag,
                this.config.stateStoreName,
            );
            if (saved) {
                return;
            }
        }
    }

    private async tryReserve(): Promise<Reservation> {
        const { value, etag } = await getStateEntry(this.config.key, this.config.stateStoreName);
        const now = Date.now();
        const state = this.parseState(value, now);

        const backoffUntil = Math.max(state.backoffUntil, this.backoffUntil);
        this.lastDispatchAt = Math.max(this.lastDispatchAt, state.lastDispatchAt);

        if (now < backoffUntil) {
            const waitMs = backoffUntil - now;
            if (waitMs > this.config.maxBackoffWaitMs) {
                return { kind: 'unavailable', waitMs };
            }
            return { kind: 'wait', waitMs };
        }

        const refillPerMs = this.config.refillPerSecond / 1000;
        const elapsed = Math.max(0, now - state.lastRefillAt);
        const tokens = Math.min(this.config.capacity, state.tokens + elapsed * refillPerMs);

        if (tokens < 1) {
            return { kind: 'wait', waitMs: (1 - tokens) / refillPerMs };
        }

        // Reserve a distinct dispatch slot. Without this, several callers could
        // each win a token in the same tick and then all fire simultaneously,
        // which is exactly the burst shape the upstream rejects.
        const slotAt = Math.max(state.nextSlotAt, now);
        const next: BucketState = {
            tokens: tokens - 1,
            lastRefillAt: now,
            nextSlotAt: slotAt + this.config.staggerMs,
            backoffUntil,
            lastDispatchAt: slotAt,
        };

        const saved = await saveStateValueIfMatch(
            this.config.key,
            JSON.stringify(next),
            etag,
            this.config.stateStoreName,
        );
        if (!saved) {
            return { kind: 'conflict' };
        }

        this.lastDispatchAt = slotAt;
        return { kind: 'granted', waitMs: Math.max(0, slotAt - now) };
    }

    private parseState(
        value: string | null,
        now: number,
        seedBackoffUntil = this.backoffUntil,
    ): BucketState {
        if (value) {
            try {
                const parsed = JSON.parse(value) as Partial<BucketState>;
                if (
                    typeof parsed.tokens === 'number' &&
                    typeof parsed.lastRefillAt === 'number' &&
                    typeof parsed.nextSlotAt === 'number' &&
                    typeof parsed.backoffUntil === 'number'
                ) {
                    return {
                        tokens: parsed.tokens,
                        lastRefillAt: parsed.lastRefillAt,
                        nextSlotAt: parsed.nextSlotAt,
                        backoffUntil: parsed.backoffUntil,
                        // Absent in buckets written before this field existed.
                        lastDispatchAt:
                            typeof parsed.lastDispatchAt === 'number' ? parsed.lastDispatchAt : 0,
                    };
                }
            } catch {
                // Corrupt or legacy payload: fall through to a fresh bucket.
            }
        }

        return {
            tokens: this.config.capacity,
            lastRefillAt: now,
            nextSlotAt: now,
            backoffUntil: seedBackoffUntil,
            lastDispatchAt: this.lastDispatchAt,
        };
    }

    private warnFallbackOnce(error: unknown): void {
        if (this.fallbackWarned) {
            return;
        }

        this.fallbackWarned = true;
        logger.warn('shared rate limit state unavailable; limiting locally for this process', {
            key: this.config.key,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

const noopRelease = (): void => {};

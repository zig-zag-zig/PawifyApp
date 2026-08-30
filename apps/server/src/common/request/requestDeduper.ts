import { createLogger } from '../logging/logger.js';

const DEFAULT_DEDUP_TTL_MS = 60_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 20_000;
const DEFAULT_IN_FLIGHT_DEDUPE_BUFFER_MS = 5_000;
const MIN_IN_FLIGHT_DEDUPE_AGE_MS = 1_000;
const READ_ONLY_OPERATION_VERBS = ['fetch', 'get', 'list', 'read', 'search', 'verify'];

const logger = createLogger('common.requestDeduper');

export const getDefaultInFlightDedupeAgeMs = (ttlMs: number): number => {
    const withBuffer = ttlMs - DEFAULT_IN_FLIGHT_DEDUPE_BUFFER_MS;
    if (withBuffer >= MIN_IN_FLIGHT_DEDUPE_AGE_MS) {
        return withBuffer;
    }

    // Keep a small but non-zero window for very small TTL values.
    return Math.max(Math.floor(ttlMs * 0.9), 0);
};

export const classifyOperationKey = (
    key: string,
): { operationName: string; isReadOnly: boolean } => {
    const operationName = key.split(':', 1)[0]?.trim().toLowerCase() ?? '';

    return {
        operationName,
        isReadOnly: READ_ONLY_OPERATION_VERBS.some(
            (verb) => operationName === verb || operationName.startsWith(verb),
        ),
    };
};

type RecentResult = {
    value: unknown;
    expiresAt: number;
};

type InFlightRequest = {
    startedAt: number;
    promise: Promise<unknown>;
};

// Tracks how many times a key has been invalidated. In-flight requests capture the
// generation at start; if it changes before they settle, their result is not cached.
type KeyGeneration = {
    generation: number;
    updatedAt: number;
};

export interface RequestDeduperPort {
    run<T>(key: string, worker: () => Promise<T>): Promise<T>;
    /**
     * Drops cached results (and joinable in-flight expectations) for every key that
     * starts with keyPrefix, so the next run() for those keys hits the source again.
     * Write flows call this after mutations (e.g. follow/unfollow, account deletion).
     */
    invalidate(keyPrefix: string): void;
}

class RequestDeduper implements RequestDeduperPort {
    private readonly inFlightRequests = new Map<string, InFlightRequest>();
    private readonly recentResults = new Map<string, RecentResult>();
    private readonly keyGenerations = new Map<string, KeyGeneration>();
    private readonly ttlMs: number;
    private readonly inFlightDedupeAgeMs: number;

    constructor(
        ttlMs = DEFAULT_DEDUP_TTL_MS,
        inFlightDedupeAgeMs = getDefaultInFlightDedupeAgeMs(ttlMs),
    ) {
        this.ttlMs = ttlMs;
        this.inFlightDedupeAgeMs = Math.max(Math.min(inFlightDedupeAgeMs, ttlMs), 0);
    }

    async run<T>(key: string, worker: () => Promise<T>): Promise<T> {
        const operation = classifyOperationKey(key);
        if (!operation.isReadOnly) {
            logger.warn('skipping dedupe for non-read operation key', {
                operationName: operation.operationName,
                keyLength: key.length,
            });

            return await worker();
        }

        this.cleanupExpiredResults();

        const now = Date.now();
        const recent = this.recentResults.get(key);
        if (recent && recent.expiresAt > now) {
            return recent.value as T;
        }

        const inFlight = this.inFlightRequests.get(key);
        if (inFlight) {
            const inFlightAgeMs = now - inFlight.startedAt;
            if (inFlightAgeMs <= this.inFlightDedupeAgeMs) {
                return (await inFlight.promise) as T;
            }
        }

        const generation = this.keyGenerations.get(key)?.generation ?? 0;
        const promise = worker()
            .then((value) => {
                const currentGeneration = this.keyGenerations.get(key)?.generation ?? 0;
                if (currentGeneration !== generation) {
                    // The key was invalidated while this request was in flight (a write
                    // happened after the underlying read started), so the value may be
                    // stale. Do not cache it; the next run() hits the source again.
                    return value;
                }

                this.recentResults.set(key, {
                    value,
                    expiresAt: Date.now() + this.ttlMs,
                });
                return value;
            })
            .finally(() => {
                const currentInFlight = this.inFlightRequests.get(key);
                if (currentInFlight?.promise === promise) {
                    this.inFlightRequests.delete(key);
                }
            });

        this.inFlightRequests.set(key, {
            startedAt: now,
            promise,
        });
        return await promise;
    }

    invalidate(keyPrefix: string): void {
        for (const key of [...this.recentResults.keys()]) {
            if (key.startsWith(keyPrefix)) {
                this.recentResults.delete(key);
                this.bumpKeyGeneration(key);
            }
        }

        for (const key of [...this.inFlightRequests.keys()]) {
            if (key.startsWith(keyPrefix)) {
                // Drop the in-flight expectation too, so a concurrent run() does not
                // join a request whose source read predates the invalidation.
                this.inFlightRequests.delete(key);
                this.bumpKeyGeneration(key);
            }
        }
    }

    private bumpKeyGeneration(key: string): void {
        const now = Date.now();
        const current = this.keyGenerations.get(key);
        this.keyGenerations.set(key, {
            generation: (current?.generation ?? 0) + 1,
            updatedAt: now,
        });
    }

    cleanupExpiredResults(): void {
        const now = Date.now();

        for (const [key, entry] of this.recentResults.entries()) {
            if (entry.expiresAt <= now) {
                this.recentResults.delete(key);
            }
        }

        // Generation entries only matter while an invalidated in-flight request may
        // still settle. Once they are older than the TTL, no live promise can be
        // holding a matching generation (a stale promise resolving after its entry
        // was purged merely skips caching, never serves stale data).
        for (const [key, generation] of this.keyGenerations.entries()) {
            if (now - generation.updatedAt > this.ttlMs) {
                this.keyGenerations.delete(key);
            }
        }
    }
}

export const requestDeduper = new RequestDeduper();

setInterval(() => requestDeduper.cleanupExpiredResults(), DEFAULT_CLEANUP_INTERVAL_MS).unref?.();

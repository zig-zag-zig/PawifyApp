import { createLogger } from '../../common/logging/logger.js';
import { lyricsDbConfig } from '../../config/runtimeConfig.js';
import {
    buildDurableLyricsLookupIdentity,
    isLyricsRefreshDue,
    isUsableLyricsState,
    readLyricsStates,
    recordLyricsConfirmedMiss,
    recordLyricsFound,
    recordLyricsTransientFailure,
    type LyricsLookupRequest,
} from '../../infrastructure/lyricsDb/lyricsStateRepository.js';
import { fetchGeniusLyrics } from '../musicApi/geniusClient.js';
import { isAbortError } from '../musicApi/httpClient.js';

const logger = createLogger('services.lyrics.resolver');

export type LyricsResolutionOutcome = 'found' | 'confirmed-miss' | 'failure';

export type LyricsResolution = {
    /** String for found, null for a confirmed dual miss, undefined for retryable failure. */
    url: string | null | undefined;
    outcome: LyricsResolutionOutcome;
    provider: 'genius' | 'musicbrainz' | 'stored' | null;
};

type InFlight = {
    promise: Promise<LyricsResolution>;
    controller: AbortController;
    waiters: number;
};

const inFlight = new Map<string, InFlight>();

const isAborted = (signal: AbortSignal | undefined): boolean => signal?.aborted === true;

/**
 * Registers a caller with a shared provider job.
 *
 * The job is aborted only when every waiter has cancelled, so one screen
 * navigating away does not cancel work another screen is waiting for.
 */
const attachWaiter = (signal: AbortSignal | undefined, entry: InFlight): void => {
    entry.waiters += 1;
    let released = false;
    const release = (abortJob: boolean): void => {
        if (released) return;
        released = true;
        entry.waiters = Math.max(0, entry.waiters - 1);
        if (abortJob && entry.waiters === 0 && !entry.controller.signal.aborted) {
            entry.controller.abort();
        }
    };

    if (signal) {
        const abort = () => release(true);
        signal.addEventListener('abort', abort, { once: true });
        void entry.promise.finally(() => {
            signal.removeEventListener('abort', abort);
            release(false);
        });
        return;
    }

    void entry.promise.finally(() => release(false));
};

const DAY_MS = 24 * 60 * 60 * 1000;

const preservedFound = (
    request: LyricsLookupRequest,
    url: string,
    attempts: { geniusAttempted: boolean; musicbrainzAttempted: boolean },
): LyricsResolution => {
    // Keep serving the known URL, but do not re-spend both providers on every
    // screen open while upstream is stable. A miss TTL is the bounded refresh
    // policy for a preserved success.
    recordLyricsTransientFailure(request, {
        ...attempts,
        retryAfterMs: lyricsDbConfig.missTtlDays * DAY_MS,
    });
    return { url, outcome: 'found', provider: 'stored' };
};

const resolveFresh = async (
    request: LyricsLookupRequest,
    signal: AbortSignal,
    existingFoundUrl?: string | null,
): Promise<LyricsResolution> => {
    const attempts = { geniusAttempted: false, musicbrainzAttempted: false };

    const genius = await fetchGeniusLyrics(request.artistName, request.trackName, signal);
    attempts.geniusAttempted = true;
    if (genius.status === 'found') {
        recordLyricsFound(request, genius.url, 'genius', attempts);
        return { url: genius.url, outcome: 'found', provider: 'genius' };
    }

    // Navigation/abort cancellation is not a provider miss: do not persist
    // anything derived from an incomplete request.
    if (signal.aborted) {
        return { url: undefined, outcome: 'failure', provider: null };
    }

    if (genius.status === 'failure') {
        // Missing credential/rate limit/network: retryable, never a miss.
        if (existingFoundUrl) {
            return preservedFound(request, existingFoundUrl, attempts);
        }
        recordLyricsTransientFailure(request, attempts);
        return { url: undefined, outcome: 'failure', provider: null };
    }

    // Genius answered "no lyrics" for this exact query variant. It is the only
    // live provider: the catalogue mirror and the durable lyrics DB carry every
    // other answer, so a successful miss is a confirmed absence.
    if (existingFoundUrl) {
        return preservedFound(request, existingFoundUrl, attempts);
    }
    recordLyricsConfirmedMiss(request, attempts);
    return { url: null, outcome: 'confirmed-miss', provider: null };
};

/**
 * Resolves one durable lyrics lookup against Genius only.
 *
 * No live MusicBrainz calls exist on this path: the catalogue mirror and the
 * durable lyrics DB answer everything else, and the MB web service rate budget
 * belongs to the hourly sync, not to per-track user requests.
 */
export const resolveLyrics = async (
    request: LyricsLookupRequest,
    signal?: AbortSignal,
): Promise<LyricsResolution> => {
    const identity = buildDurableLyricsLookupIdentity(request);
    const stored = readLyricsStates([request]).get(identity.lookupKey);
    if (isUsableLyricsState(stored) && !isLyricsRefreshDue(stored)) {
        if (stored.outcome === 'found') {
            return { url: stored.resolvedUrl, outcome: 'found', provider: 'stored' };
        }
        return { url: null, outcome: 'confirmed-miss', provider: 'stored' };
    }
    const existingFoundUrl =
        stored?.outcome === 'found' && stored.resolvedUrl ? stored.resolvedUrl : null;

    if (isAborted(signal)) {
        return { url: undefined, outcome: 'failure', provider: null };
    }

    const existing = inFlight.get(identity.lookupKey);
    if (existing) {
        attachWaiter(signal, existing);
        return await existing.promise;
    }

    const controller = new AbortController();
    const entry: InFlight = {
        controller,
        waiters: 0,
        promise: Promise.resolve({
            url: undefined,
            outcome: 'failure' as const,
            provider: null,
        }),
    };
    entry.promise = resolveFresh(request, controller.signal, existingFoundUrl)
        .catch((error) => {
            if (isAbortError(error)) {
                return { url: undefined, outcome: 'failure', provider: null } as const;
            }
            logger.warn('lyrics resolution failed', {
                lookupKey: identity.lookupKey,
                error: error instanceof Error ? error.message : String(error),
            });
            recordLyricsTransientFailure(request, {
                geniusAttempted: true,
                musicbrainzAttempted: false,
            });
            return { url: undefined, outcome: 'failure', provider: null } as const;
        })
        .finally(() => {
            inFlight.delete(identity.lookupKey);
        });

    attachWaiter(signal, entry);
    inFlight.set(identity.lookupKey, entry);
    return await entry.promise;
};

/** Test helper: clears in-flight dedupe state. */
export const resetLyricsResolverForTests = (): void => {
    inFlight.clear();
};

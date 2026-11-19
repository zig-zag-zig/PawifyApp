import { createLogger } from '../../common/logging/logger.js';
import {
    buildDurableLyricsLookupIdentity,
    isUsableLyricsState,
    readLyricsStates,
    recordLyricsConfirmedMiss,
    recordLyricsFound,
    recordLyricsTransientFailure,
    type LyricsLookupRequest,
} from '../../infrastructure/lyricsDb/lyricsStateRepository.js';
import { fetchGeniusLyrics } from '../musicApi/geniusClient.js';
import { fetchMusicBrainzLyricsFallback } from '../musicApi/musicBrainzLyricsFallback.js';
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

const resolveFresh = async (
    request: LyricsLookupRequest,
    signal: AbortSignal,
    canUseMusicBrainzFallback?: () => boolean,
): Promise<LyricsResolution> => {
    let geniusAttempted = false;
    let musicbrainzAttempted = false;
    let sawTransientFailure = false;

    const genius = await fetchGeniusLyrics(request.artistName, request.trackName, signal);
    geniusAttempted = true;
    if (genius.status === 'found') {
        recordLyricsFound(request, genius.url, 'genius', {
            geniusAttempted,
            musicbrainzAttempted,
        });
        return { url: genius.url, outcome: 'found', provider: 'genius' };
    }

    // Navigation/abort cancellation is not a provider miss: do not ask another
    // provider after an abort and do not persist a confirmed miss.
    if (signal.aborted) {
        return { url: undefined, outcome: 'failure', provider: null };
    }
    if (genius.status === 'failure') {
        sawTransientFailure = true;
    }

    const recordingId = request.recordingId?.trim();
    if (!recordingId) {
        // No trustworthy recording identity: the MusicBrainz fallback would have
        // to search the catalogue, which is explicitly not allowed.
        if (sawTransientFailure) {
            recordLyricsTransientFailure(request, { geniusAttempted, musicbrainzAttempted });
            return { url: undefined, outcome: 'failure', provider: null };
        }
        recordLyricsConfirmedMiss(request, { geniusAttempted, musicbrainzAttempted });
        return { url: null, outcome: 'confirmed-miss', provider: null };
    }

    if (!(canUseMusicBrainzFallback?.() ?? true)) {
        // Per-job budget exhausted: this is not a confirmed absence from a
        // successful provider, so keep retryable state.
        recordLyricsTransientFailure(request, { geniusAttempted, musicbrainzAttempted });
        return { url: undefined, outcome: 'failure', provider: null };
    }

    const fallback = await fetchMusicBrainzLyricsFallback(recordingId, signal);
    musicbrainzAttempted = true;
    if (signal.aborted) {
        return { url: undefined, outcome: 'failure', provider: null };
    }

    if (fallback.status === 'found') {
        recordLyricsFound(request, fallback.url, 'musicbrainz', {
            geniusAttempted,
            musicbrainzAttempted,
        });
        return { url: fallback.url, outcome: 'found', provider: 'musicbrainz' };
    }

    if (fallback.status === 'failure' || sawTransientFailure) {
        recordLyricsTransientFailure(request, { geniusAttempted, musicbrainzAttempted });
        return { url: undefined, outcome: 'failure', provider: null };
    }

    // Both successful providers reported absence.
    recordLyricsConfirmedMiss(request, { geniusAttempted, musicbrainzAttempted });
    return { url: null, outcome: 'confirmed-miss', provider: null };
};

/**
 * Resolves one durable lyrics lookup.
 *
 * Stored state first, then Genius, then the narrow MusicBrainz lyrics fallback.
 * Concurrent callers sharing the same durable lookup key wait on one provider
 * request.
 */
export const resolveLyrics = async (
    request: LyricsLookupRequest,
    signal?: AbortSignal,
    options?: { canUseMusicBrainzFallback?: () => boolean },
): Promise<LyricsResolution> => {
    const identity = buildDurableLyricsLookupIdentity(request);
    const stored = readLyricsStates([request]).get(identity.lookupKey);
    if (isUsableLyricsState(stored)) {
        if (stored.outcome === 'found') {
            return { url: stored.resolvedUrl, outcome: 'found', provider: 'stored' };
        }
        return { url: null, outcome: 'confirmed-miss', provider: 'stored' };
    }

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
    entry.promise = resolveFresh(request, controller.signal, options?.canUseMusicBrainzFallback)
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

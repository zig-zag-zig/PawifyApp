import { createHash } from 'node:crypto';

import { createLogger } from '../../common/logging/logger.js';
import { lyricsDbConfig } from '../../config/runtimeConfig.js';
import { getLyricsDb, type LyricsDb } from './lyricsDbClient.js';
import { compactLyricsUrlForStorage, expandStoredLyricsUrl } from './lyricsUrlStorage.js';
import { resolveRecordingRedirectMbid } from '../musicDb/recordingRedirects.js';

const logger = createLogger('infrastructure.lyricsDb.state');

/**
 * Persisted lyric state for one durable lookup.
 *
 * Three shapes, matching the storage columns exactly:
 *  - `lyricsUrl` set           -> resolved; permanent, never refetched
 *  - both null                 -> retryable (a provider failed, or nothing was usable)
 *  - `lyricsUrl` null, `retryAfter` in the future -> confirmed absent until then
 */
export type LyricsLookupRequest = {
    /** Real MusicBrainz recording id, when the mirror knows it. */
    recordingId?: string | null;
    artistName: string;
    trackName: string;
};

export type LyricsLookupIdentity = {
    lookupKey: string;
    queryFingerprint: string;
};

export type LyricsLookupState = {
    lookupKey: string;
    lyricsUrl: string | null;
    retryAfter: number | null;
};

const normalizeFingerprintPart = (value: string): string =>
    value
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

/**
 * Normalized identity of the query that actually reached a provider.
 *
 * It is a variant key, never a substitute for a recording MBID: a changed track
 * title or credit produces a different key so a miss for one variant cannot hide a
 * match for another.
 */
export const buildLyricsQueryFingerprint = (request: LyricsLookupRequest): string => {
    const artist = normalizeFingerprintPart(request.artistName);
    const track = normalizeFingerprintPart(request.trackName);
    return createHash('sha256').update(`${artist}\u001f${track}`).digest('hex').slice(0, 32);
};

export const buildLyricsLookupIdentity = (request: LyricsLookupRequest): LyricsLookupIdentity => {
    const queryFingerprint = buildLyricsQueryFingerprint(request);
    const recording = request.recordingId?.trim();
    return {
        queryFingerprint,
        lookupKey: recording
            ? `recording:${recording}:${queryFingerprint}`
            : `query:${queryFingerprint}`,
    };
};

/** Identity candidates: canonical redirect target first, original second. */
const lookupIdentities = (request: LyricsLookupRequest): LyricsLookupIdentity[] => {
    const original = buildLyricsLookupIdentity(request);
    const recording = request.recordingId?.trim();
    if (!recording) return [original];

    const canonicalRecording = resolveRecordingRedirectMbid(recording);
    if (canonicalRecording === recording) return [original];

    const canonical = buildLyricsLookupIdentity({
        ...request,
        recordingId: canonicalRecording,
    });
    return [canonical, original];
};

const canonicalRequest = (request: LyricsLookupRequest): LyricsLookupRequest => {
    const recording = request.recordingId?.trim();
    if (!recording) return request;
    return { ...request, recordingId: resolveRecordingRedirectMbid(recording) };
};

export const buildDurableLyricsLookupIdentity = (
    request: LyricsLookupRequest,
): LyricsLookupIdentity => lookupIdentities(request)[0]!;

const rowToState = (row: {
    lookup_key: string;
    lyrics_url: string | null;
    retry_after: number | null;
}): LyricsLookupState => ({
    lookupKey: row.lookup_key,
    lyricsUrl: row.lyrics_url ? expandStoredLyricsUrl(row.lyrics_url) : null,
    retryAfter: row.retry_after,
});

/**
 * Whether stored state answers the request without a provider call.
 *
 * A resolved URL is permanent and always answers. A confirmed absence answers
 * until its retry gate opens. A retryable row never masks the absence of a value.
 */
export const isUsableLyricsState = (
    state: LyricsLookupState | null | undefined,
    now = Date.now(),
): state is LyricsLookupState => {
    if (!state) return false;
    if (state.lyricsUrl) return true;
    return state.retryAfter !== null && state.retryAfter > now;
};

/** Whether provider work should run for this row. */
export const isLyricsRefreshDue = (
    state: LyricsLookupState | null | undefined,
    now = Date.now(),
): boolean => {
    if (!state) return true;
    // Resolved lyrics do not expire.
    if (state.lyricsUrl) return false;
    if (state.retryAfter === null) return true;
    return state.retryAfter <= now;
};

const withDb = <T>(operation: string, worker: (db: LyricsDb) => T, fallback: T): T => {
    const db = getLyricsDb();
    if (!db) return fallback;
    try {
        return worker(db);
    } catch (error) {
        logger.error('lyrics database operation failed', { operation, error });
        return fallback;
    }
};

export const readLyricsStates = (
    requests: readonly LyricsLookupRequest[],
): Map<string, LyricsLookupState> => {
    if (requests.length === 0) return new Map();

    return withDb(
        'readLyricsStates',
        (db) => {
            const statement = db.prepare(
                `SELECT lookup_key, lyrics_url, retry_after FROM lyrics_lookup_state WHERE lookup_key = ?`,
            );
            const result = new Map<string, LyricsLookupState>();
            for (const request of requests) {
                if (result.has(buildLyricsLookupIdentity(request).lookupKey)) continue;

                for (const identity of lookupIdentities(request)) {
                    const row = statement.get(identity.lookupKey) as
                        | Parameters<typeof rowToState>[0]
                        | undefined;
                    if (row) {
                        const state = rowToState(row);
                        result.set(identity.lookupKey, state);
                        result.set(buildLyricsLookupIdentity(request).lookupKey, state);
                        result.set(buildDurableLyricsLookupIdentity(request).lookupKey, state);
                        break;
                    }
                }
            }
            return result;
        },
        new Map(),
    );
};

const DAY_MS = 24 * 60 * 60 * 1000;

const writeState = (
    request: LyricsLookupRequest,
    state: { lyricsUrl: string | null; retryAfter: number | null },
): void => {
    withDb(
        'upsertLyricsState',
        (db) => {
            const durableRequest = canonicalRequest(request);
            const identity = buildLyricsLookupIdentity(durableRequest);
            db.prepare(
                `INSERT INTO lyrics_lookup_state (lookup_key, lyrics_url, retry_after)
                 VALUES (@lookupKey, @lyricsUrl, @retryAfter)
                 ON CONFLICT(lookup_key) DO UPDATE SET
                     lyrics_url = excluded.lyrics_url,
                     retry_after = excluded.retry_after`,
            ).run({
                lookupKey: identity.lookupKey,
                lyricsUrl: state.lyricsUrl ? compactLyricsUrlForStorage(state.lyricsUrl) : null,
                retryAfter: state.retryAfter,
            });
        },
        undefined,
    );
};

/** Persists a resolved lyric permanently: this row never reaches a provider again. */
export const recordLyricsUrl = (request: LyricsLookupRequest, url: string): void => {
    writeState(request, { lyricsUrl: url, retryAfter: null });
};

/** Persists "nothing found" with the gate that keeps it from being retried early. */
export const recordLyricsAbsent = (
    request: LyricsLookupRequest,
    options: { retryAfterMs?: number } = {},
): void => {
    const gateMs = options.retryAfterMs ?? lyricsDbConfig.missTtlDays * DAY_MS;
    writeState(request, {
        lyricsUrl: null,
        retryAfter: gateMs > 0 ? Date.now() + gateMs : null,
    });
};

/** Persists "provider failed / no usable answer": retried on the next request. */
export const recordLyricsRetryable = (request: LyricsLookupRequest): void => {
    writeState(request, { lyricsUrl: null, retryAfter: null });
};

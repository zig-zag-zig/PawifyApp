import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { createLogger } from '../../common/logging/logger.js';
import { lyricsDbConfig } from '../../config/runtimeConfig.js';
import { getLyricsDb, type LyricsDb } from './lyricsDbClient.js';
import { compactLyricsUrlForStorage, expandStoredLyricsUrl } from './lyricsUrlStorage.js';
import { resolveRecordingRedirectMbid } from '../musicDb/recordingRedirects.js';

const logger = createLogger('infrastructure.lyricsDb.state');

export type LyricsProvider = 'genius' | 'musicbrainz';
export type LyricsOutcome = 'found' | 'confirmed-miss' | 'transient-failure';

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
    recordingMbid: string | null;
    queryFingerprint: string;
    resolvedUrl: string | null;
    provider: LyricsProvider | null;
    outcome: LyricsOutcome;
    checkedAt: number;
    nextAttemptAt: number;
    geniusAttemptedAt: number | null;
    musicbrainzAttemptedAt: number | null;
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
    recording_mbid: string | null;
    query_fingerprint: string;
    resolved_url: string | null;
    provider: string | null;
    outcome: string;
    checked_at: number;
    next_attempt_at: number;
    genius_attempted_at: number | null;
    musicbrainz_attempted_at: number | null;
}): LyricsLookupState => ({
    lookupKey: row.lookup_key,
    recordingMbid: row.recording_mbid,
    queryFingerprint: row.query_fingerprint,
    resolvedUrl: row.resolved_url ? expandStoredLyricsUrl(row.resolved_url) : null,
    provider: row.provider === 'genius' || row.provider === 'musicbrainz' ? row.provider : null,
    outcome: row.outcome as LyricsOutcome,
    checkedAt: row.checked_at,
    nextAttemptAt: row.next_attempt_at,
    geniusAttemptedAt: row.genius_attempted_at,
    musicbrainzAttemptedAt: row.musicbrainz_attempted_at,
});

/**
 * Whether a stored state can satisfy a request without a provider call.
 *
 * A found URL is always usable; `next_attempt_at` only says when a background
 * refresh is due. A confirmed miss is usable until its negative TTL expires.
 * Transient failures never mask the absence of a value.
 */
export const isUsableLyricsState = (
    state: LyricsLookupState | null | undefined,
    now = Date.now(),
): state is LyricsLookupState => {
    if (!state) return false;
    if (state.outcome === 'found') return Boolean(state.resolvedUrl);
    if (state.outcome === 'confirmed-miss') return state.nextAttemptAt > now;
    return false;
};

/** Whether a stored value is old enough that a refresh should be attempted. */
export const isLyricsRefreshDue = (
    state: LyricsLookupState | null | undefined,
    now = Date.now(),
): boolean => {
    if (!state) return true;
    if (state.outcome === 'transient-failure') return true;
    return state.nextAttemptAt <= now;
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
                `SELECT lookup_key, recording_mbid, query_fingerprint, resolved_url, provider,
                        outcome, checked_at, next_attempt_at, genius_attempted_at,
                        musicbrainz_attempted_at
                 FROM lyrics_lookup_state WHERE lookup_key = ?`,
            );
            const result = new Map<string, LyricsLookupState>();
            for (const request of requests) {
                if (result.has(buildLyricsLookupIdentity(request).lookupKey)) continue;

                for (const identity of lookupIdentities(request)) {
                    const row = statement.get(identity.lookupKey) as
                        Parameters<typeof rowToState>[0] | undefined;
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

const upsertState = (
    request: LyricsLookupRequest,
    state: {
        resolvedUrl: string | null;
        provider: LyricsProvider | null;
        outcome: LyricsOutcome;
        nextAttemptAt: number;
        geniusAttempted: boolean;
        musicbrainzAttempted: boolean;
    },
): void => {
    withDb(
        'upsertLyricsState',
        (db) => {
            const durableRequest = canonicalRequest(request);
            const identity = buildLyricsLookupIdentity(durableRequest);
            const now = Date.now();
            db.prepare(
                `INSERT INTO lyrics_lookup_state (
                     lookup_key, recording_mbid, query_fingerprint, resolved_url, provider,
                     outcome, checked_at, next_attempt_at, genius_attempted_at,
                     musicbrainz_attempted_at
                 ) VALUES (
                     @lookupKey, @recordingMbid, @queryFingerprint, @resolvedUrl, @provider,
                     @outcome, @checkedAt, @nextAttemptAt, @geniusAttemptedAt,
                     @musicbrainzAttemptedAt
                 )
                 ON CONFLICT(lookup_key) DO UPDATE SET
                     recording_mbid = excluded.recording_mbid,
                     resolved_url = excluded.resolved_url,
                     provider = excluded.provider,
                     outcome = excluded.outcome,
                     checked_at = excluded.checked_at,
                     next_attempt_at = excluded.next_attempt_at,
                     genius_attempted_at = COALESCE(excluded.genius_attempted_at, lyrics_lookup_state.genius_attempted_at),
                     musicbrainz_attempted_at = COALESCE(excluded.musicbrainz_attempted_at, lyrics_lookup_state.musicbrainz_attempted_at)`,
            ).run({
                lookupKey: identity.lookupKey,
                recordingMbid: durableRequest.recordingId?.trim() || null,
                queryFingerprint: identity.queryFingerprint,
                resolvedUrl: state.resolvedUrl
                    ? compactLyricsUrlForStorage(state.resolvedUrl)
                    : null,
                provider: state.provider,
                outcome: state.outcome,
                checkedAt: now,
                nextAttemptAt: state.nextAttemptAt,
                geniusAttemptedAt: state.geniusAttempted ? now : null,
                musicbrainzAttemptedAt: state.musicbrainzAttempted ? now : null,
            });
        },
        undefined,
    );
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const recordLyricsFound = (
    request: LyricsLookupRequest,
    url: string,
    provider: LyricsProvider,
    options: {
        geniusAttempted: boolean;
        musicbrainzAttempted: boolean;
        /** Use the shorter provider retry window for a fallback result. */
        retryAfterMs?: number;
    },
): void => {
    upsertState(request, {
        resolvedUrl: url,
        provider,
        outcome: 'found',
        nextAttemptAt:
            Date.now() + (options.retryAfterMs ?? lyricsDbConfig.successTtlDays * DAY_MS),
        geniusAttempted: options.geniusAttempted,
        musicbrainzAttempted: options.musicbrainzAttempted,
    });
};

export const recordLyricsConfirmedMiss = (
    request: LyricsLookupRequest,
    options: { geniusAttempted: boolean; musicbrainzAttempted: boolean },
): void => {
    upsertState(request, {
        resolvedUrl: null,
        provider: null,
        outcome: 'confirmed-miss',
        nextAttemptAt: Date.now() + lyricsDbConfig.missTtlDays * DAY_MS,
        ...options,
    });
};

export const recordLyricsTransientFailure = (
    request: LyricsLookupRequest,
    options: {
        geniusAttempted: boolean;
        musicbrainzAttempted: boolean;
        /** Longer retry window when a previously found URL is preserved. */
        retryAfterMs?: number;
    },
): void => {
    // A failed refresh must never destroy a previously found URL. Keep the row in
    // `found` state with a short retry window; the stored URL stays usable in the
    // meantime. Only a lookup with no usable result becomes transient.
    const existing = readLyricsStates([request]).get(buildLyricsLookupIdentity(request).lookupKey);
    if (existing?.outcome === 'found' && existing.resolvedUrl) {
        upsertState(request, {
            resolvedUrl: existing.resolvedUrl,
            provider: existing.provider,
            outcome: 'found',
            nextAttemptAt: Date.now() + (options.retryAfterMs ?? lyricsDbConfig.transientRetryMs),
            ...options,
        });
        return;
    }

    upsertState(request, {
        resolvedUrl: null,
        provider: null,
        outcome: 'transient-failure',
        nextAttemptAt: Date.now() + lyricsDbConfig.transientRetryMs,
        ...options,
    });
};

export type LyricsStoreStats = {
    rows: number;
    foundCount: number;
    confirmedMissCount: number;
    transientFailureCount: number;
    geniusFoundCount: number;
    musicbrainzFoundCount: number;
    /** Rows that would be attempted again on the next request. */
    dueRetryCount: number;
    dbBytes: number;
    walBytes: number;
};

export const getLyricsStoreStats = (): LyricsStoreStats => {
    return withDb(
        'getLyricsStoreStats',
        (db) => {
            const rows = db
                .prepare(
                    `SELECT
                         COUNT(*) AS rows,
                         SUM(outcome = 'found') AS foundCount,
                         SUM(outcome = 'confirmed-miss') AS confirmedMissCount,
                         SUM(outcome = 'transient-failure') AS transientFailureCount,
                         SUM(provider = 'genius') AS geniusFoundCount,
                         SUM(provider = 'musicbrainz') AS musicbrainzFoundCount,
                         SUM(outcome = 'transient-failure' OR next_attempt_at <= ?) AS dueRetryCount
                     FROM lyrics_lookup_state`,
                )
                .get(Date.now()) as {
                rows: number;
                foundCount: number;
                confirmedMissCount: number;
                transientFailureCount: number;
                geniusFoundCount: number;
                musicbrainzFoundCount: number;
                dueRetryCount: number;
            };
            const pageCount = db.pragma('page_count', { simple: true }) as number;
            const pageSize = db.pragma('page_size', { simple: true }) as number;
            const walPath = `${lyricsDbConfig.path ?? ''}-wal`;
            let walBytes = 0;
            try {
                walBytes = fs.statSync(walPath).size;
            } catch {
                walBytes = 0;
            }
            return {
                rows: rows.rows ?? 0,
                foundCount: rows.foundCount ?? 0,
                confirmedMissCount: rows.confirmedMissCount ?? 0,
                transientFailureCount: rows.transientFailureCount ?? 0,
                geniusFoundCount: rows.geniusFoundCount ?? 0,
                musicbrainzFoundCount: rows.musicbrainzFoundCount ?? 0,
                dueRetryCount: rows.dueRetryCount ?? 0,
                dbBytes: pageCount * pageSize,
                walBytes,
            };
        },
        {
            rows: 0,
            foundCount: 0,
            confirmedMissCount: 0,
            transientFailureCount: 0,
            geniusFoundCount: 0,
            musicbrainzFoundCount: 0,
            dueRetryCount: 0,
            dbBytes: 0,
            walBytes: 0,
        },
    );
};

export type LyricsHousekeepingPlan = {
    removableRows: number;
    removableFound: number;
    removableMisses: number;
    removableFailures: number;
};

const housekeepingCutoffs = () => {
    const now = Date.now();
    return {
        now,
        successCutoff: now - lyricsDbConfig.successTtlDays * DAY_MS,
        missCutoff: now - Math.max(lyricsDbConfig.missTtlDays * DAY_MS, 30 * DAY_MS),
    };
};

export const previewLyricsHousekeeping = (): LyricsHousekeepingPlan => {
    const { successCutoff, missCutoff } = housekeepingCutoffs();
    return withDb(
        'previewLyricsHousekeeping',
        (db) => {
            const row = db
                .prepare(
                    `SELECT
                         SUM(outcome = 'found' AND checked_at < ?) AS found,
                         SUM(outcome = 'confirmed-miss' AND checked_at < ?) AS misses,
                         SUM(outcome = 'transient-failure' AND checked_at < ?) AS failures
                     FROM lyrics_lookup_state`,
                )
                .get(successCutoff, missCutoff, missCutoff) as {
                found: number | null;
                misses: number | null;
                failures: number | null;
            };
            const found = row.found ?? 0;
            const misses = row.misses ?? 0;
            const failures = row.failures ?? 0;
            return {
                removableRows: found + misses + failures,
                removableFound: found,
                removableMisses: misses,
                removableFailures: failures,
            };
        },
        { removableRows: 0, removableFound: 0, removableMisses: 0, removableFailures: 0 },
    );
};

export const applyLyricsHousekeeping = (): LyricsHousekeepingPlan => {
    const { successCutoff, missCutoff } = housekeepingCutoffs();
    return withDb(
        'applyLyricsHousekeeping',
        (db) => {
            let removedFound = 0;
            let removedMisses = 0;
            let removedFailures = 0;

            db.transaction(() => {
                const remove = db.prepare(
                    `DELETE FROM lyrics_lookup_state
                     WHERE lookup_key IN (
                         SELECT lookup_key FROM lyrics_lookup_state
                         WHERE outcome = ? AND checked_at < ?
                         LIMIT ?
                     )`,
                );
                removedFound = remove.run(
                    'found',
                    successCutoff,
                    lyricsDbConfig.housekeepingBatchSize,
                ).changes;
                removedMisses = remove.run(
                    'confirmed-miss',
                    missCutoff,
                    lyricsDbConfig.housekeepingBatchSize,
                ).changes;
                removedFailures = remove.run(
                    'transient-failure',
                    missCutoff,
                    lyricsDbConfig.housekeepingBatchSize,
                ).changes;
            })();

            return {
                removableRows: removedFound + removedMisses + removedFailures,
                removableFound: removedFound,
                removableMisses: removedMisses,
                removableFailures: removedFailures,
            };
        },
        { removableRows: 0, removableFound: 0, removableMisses: 0, removableFailures: 0 },
    );
};

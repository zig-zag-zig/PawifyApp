import { createLogger } from '../../common/logging/logger.js';
import { isConfirmedMissingFetchFailure, isFetchFailureResult } from './types.js';
import { fetchMusicBrainzWithStatus } from './musicBrainzClient.js';

const logger = createLogger('services.musicApi.musicBrainzLyricsFallback');

const MAX_WORK_PROBES = 3;
const REQUEST_TIMEOUT_MS = 8_000;

export type LyricsFallbackResult =
    | { status: 'found'; url: string; provider: 'musicbrainz' }
    | { status: 'miss' }
    | { status: 'failure' };

type MusicBrainzRelation = {
    type?: unknown;
    url?: { resource?: unknown };
    work?: { id?: unknown };
};

type MusicBrainzEntity = {
    relations?: unknown;
};

const LYRICS_URL_HOSTS = [
    'genius.com',
    'lyrics.com',
    'azlyrics.com',
    'musixmatch.com',
    'songlyrics.com',
    'letras.mus.br',
    'uta-net.com',
    'kget.jp',
    'mojim.com',
];

const isSafeLyricsUrl = (value: string): boolean => {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return false;
        return LYRICS_URL_HOSTS.some(
            (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        );
    } catch {
        return false;
    }
};

const relationsOf = (payload: unknown): MusicBrainzRelation[] => {
    if (!payload || typeof payload !== 'object') return [];
    const relations = (payload as MusicBrainzEntity).relations;
    return Array.isArray(relations) ? (relations as MusicBrainzRelation[]) : [];
};

const selectLyricsUrl = (relations: readonly MusicBrainzRelation[]): string | null => {
    const urls: string[] = [];
    for (const relation of relations) {
        if (relation.type !== 'lyrics') continue;
        const resource = relation.url?.resource;
        if (typeof resource !== 'string' || !isSafeLyricsUrl(resource)) continue;
        urls.push(resource);
    }

    // Prefer Genius when several valid fallback relations exist.
    return urls.find((url) => url.includes('genius.com')) ?? urls[0] ?? null;
};

const withTimeout = async <T>(
    worker: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
): Promise<T> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
        return await worker(controller.signal);
    } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
    }
};

/**
 * Narrow MusicBrainz Web Service consumer.
 *
 * This is the only runtime path allowed to request MusicBrainz metadata. It maps
 * a known recording MBID to its `lyrics` url relations (including linked works),
 * never performs a catalogue/track search and never reopens general MB fallbacks.
 */
export const fetchMusicBrainzLyricsFallback = async (
    recordingId: string,
    signal?: AbortSignal,
): Promise<LyricsFallbackResult> => {
    try {
        return await withTimeout(async (timeoutSignal) => {
            const recording = await fetchMusicBrainzWithStatus(
                `/recording/${encodeURIComponent(recordingId)}?fmt=json&inc=url-rels+work-rels`,
                'GET',
                timeoutSignal,
                'background',
            );

            if (isFetchFailureResult(recording)) {
                return isConfirmedMissingFetchFailure(recording)
                    ? { status: 'miss' }
                    : { status: 'failure' };
            }

            const recordingRelations = relationsOf(recording);
            const direct = selectLyricsUrl(recordingRelations);
            if (direct) {
                return { status: 'found', url: direct, provider: 'musicbrainz' };
            }

            const workIds = Array.from(
                new Set(
                    recordingRelations
                        .filter((relation) => relation.type === 'performance')
                        .map((relation) => relation.work?.id)
                        .filter((id): id is string => typeof id === 'string' && id.length > 0),
                ),
            ).slice(0, MAX_WORK_PROBES);

            let sawFailure = false;
            for (const workId of workIds) {
                const work = await fetchMusicBrainzWithStatus(
                    `/work/${encodeURIComponent(workId)}?fmt=json&inc=url-rels`,
                    'GET',
                    timeoutSignal,
                    'background',
                );
                if (isFetchFailureResult(work)) {
                    sawFailure = true;
                    continue;
                }
                const url = selectLyricsUrl(relationsOf(work));
                if (url) {
                    return { status: 'found', url, provider: 'musicbrainz' };
                }
            }

            // A missing recording is a confirmed miss; a failed work probe is not.
            if (sawFailure) {
                return { status: 'failure' };
            }
            return { status: 'miss' };
        }, signal);
    } catch (error) {
        logger.warn('MusicBrainz lyrics fallback failed', {
            recordingId,
            error: error instanceof Error ? error.message : String(error),
        });
        return { status: 'failure' };
    }
};

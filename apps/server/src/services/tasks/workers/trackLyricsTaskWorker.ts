import { backgroundTaskWorkerConfig } from '../../../config/runtimeConfig.js';
import { createLogger } from '../../../common/logging/logger.js';
import { assetKeys, readAssetStates, writeAssetState } from '../../cache/assetCache.js';
import { fetchGeniusLyrics } from '../../musicApi/geniusClient.js';
import { getReleaseLyricsTtl } from '../../../services/cache/ttlPolicy.js';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import type { LyricsState } from '../../../utils/types/cacheTypes.js';
import type { TrackLyricsRequest, TrackLyricsTaskResult } from '../../../utils/types/taskTypes.js';
import { dedupeTracks, mapLyricsToState, shouldRefetchState } from '../backgroundTaskMappers.js';

const logger = createLogger('services.backgroundTasks.lyrics');

const TRACK_LYRICS_REQUEST_CONCURRENCY = backgroundTaskWorkerConfig.trackLyricsRequestConcurrency;

export const fetchAndUpsertTrackLyrics = async (
    releaseId: string,
    tracks: TrackLyricsRequest[],
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<TrackLyricsTaskResult> => {
    const uniqueTracks = dedupeTracks(tracks).filter((track) => track.releaseId === releaseId);
    if (uniqueTracks.length === 0) {
        return {
            releaseId,
            tracks: {},
        };
    }

    const lyricsTtl = getReleaseLyricsTtl(ttl);
    // Per-track keys: one track resolving must not rewrite the release's whole map.
    const cached = await readAssetStates<LyricsState>(
        uniqueTracks.map((track) => assetKeys.trackLyrics(releaseId, track.trackId)),
    );
    const startedAt = Date.now();
    const resultMap: { [trackId: string]: string | null | undefined } = {};
    let cacheHitCount = 0;
    let fetchedCount = 0;

    logger.debug('track lyrics batch started', {
        releaseId,
        trackCount: uniqueTracks.length,
        ttlHours: lyricsTtl,
    });

    await mapWithConcurrency(uniqueTracks, TRACK_LYRICS_REQUEST_CONCURRENCY, async (track) => {
        const cacheKey = assetKeys.trackLyrics(releaseId, track.trackId);
        const existing = cached.get(cacheKey);

        if (existing && !shouldRefetchState(existing)) {
            cacheHitCount += 1;
            resultMap[track.trackId] = existing.url;
            return;
        }

        const lyricsUrl = await fetchGeniusLyrics(track.artistName, track.trackName, signal);
        fetchedCount += 1;
        const state = mapLyricsToState(lyricsUrl);
        await writeAssetState(cacheKey, state);
        resultMap[track.trackId] = state.url;
    });

    logger.debug('track lyrics batch completed', {
        releaseId,
        trackCount: uniqueTracks.length,
        cacheHitCount,
        fetchedCount,
        durationMs: Date.now() - startedAt,
    });

    return {
        releaseId,
        tracks: resultMap,
    };
};

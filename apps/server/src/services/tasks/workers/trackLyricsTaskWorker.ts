import { backgroundTaskWorkerConfig } from '../../../config/runtimeConfig.js';
import { createLogger } from '../../../common/logging/logger.js';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import type { TrackLyricsRequest, TrackLyricsTaskResult } from '../../../utils/types/taskTypes.js';
import { dedupeTracks } from '../backgroundTaskMappers.js';
import { resolveLyrics } from '../../lyrics/lyricsResolver.js';

const logger = createLogger('services.backgroundTasks.lyrics');

const TRACK_LYRICS_REQUEST_CONCURRENCY = backgroundTaskWorkerConfig.trackLyricsRequestConcurrency;

/**
 * Resolves lyrics for a release's pending tracks.
 *
 * Persistence/durable identity lives in the application-owned lyrics SQLite
 * store behind `resolveLyrics`; this worker only maps results back to the
 * release-scoped track ids the client renders.
 */
export const fetchAndUpsertTrackLyrics = async (
    releaseId: string,
    tracks: TrackLyricsRequest[],
    _ttl: number | undefined,
    signal?: AbortSignal,
): Promise<TrackLyricsTaskResult> => {
    const uniqueTracks = dedupeTracks(tracks).filter((track) => track.releaseId === releaseId);
    if (uniqueTracks.length === 0) {
        return { releaseId, tracks: {} };
    }

    const startedAt = Date.now();
    const resultMap: { [trackId: string]: string | null | undefined } = {};
    let hitCount = 0;
    let foundCount = 0;
    let missCount = 0;
    let failureCount = 0;

    await mapWithConcurrency(uniqueTracks, TRACK_LYRICS_REQUEST_CONCURRENCY, async (track) => {
        if (signal?.aborted) {
            return;
        }

        const result = await resolveLyrics(
            {
                recordingId: track.recordingId,
                artistName: track.artistName,
                trackName: track.trackName,
            },
            signal,
        );

        resultMap[track.trackId] = result.url;
        if (result.provider === 'stored') hitCount += 1;
        if (result.outcome === 'found') foundCount += 1;
        else if (result.outcome === 'confirmed-miss') missCount += 1;
        else failureCount += 1;
    });

    logger.debug('track lyrics batch completed', {
        releaseId,
        trackCount: uniqueTracks.length,
        hitCount,
        foundCount,
        missCount,
        failureCount,
        durationMs: Date.now() - startedAt,
    });

    return { releaseId, tracks: resultMap };
};

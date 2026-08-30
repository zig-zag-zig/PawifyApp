import {
    createArtistReleaseGroupCoverCacheContext,
    flushArtistReleaseGroupCoverCacheContext,
    getReleaseCover,
    getReleaseGroupCover,
} from '../../coverArtService.js';
import { backgroundTaskWorkerConfig } from '../../../config/runtimeConfig.js';
import { createLogger } from '../../../common/logging/logger.js';
import { dedupeStrings } from '../../../common/utils/array.js';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import type {
    ReleaseGroupCoverTaskResult,
    ReleaseGroupPageEntry,
    ReleaseGroupReleaseCoverTaskResult,
} from '../../../utils/types/taskTypes.js';

const logger = createLogger('services.backgroundTasks.coverArt');

const COVER_ART_REQUEST_CONCURRENCY = backgroundTaskWorkerConfig.coverArtRequestConcurrency;

export const fetchAndUpsertReleaseGroupReleaseCovers = async (
    releaseGroupId: string,
    releaseIds: string[],
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<ReleaseGroupReleaseCoverTaskResult> => {
    const uniqueReleaseIds = dedupeStrings(releaseIds);
    const startedAt = Date.now();
    const resultMap: { [releaseId: string]: string | null | undefined } = {};

    logger.debug('release cover batch started', {
        releaseGroupId,
        releaseCount: uniqueReleaseIds.length,
        ttlHours: ttl ?? null,
    });

    await mapWithConcurrency(uniqueReleaseIds, COVER_ART_REQUEST_CONCURRENCY, async (releaseId) => {
        const cover = await getReleaseCover(releaseId, releaseGroupId, ttl, signal);
        resultMap[releaseId] = cover.state.url;
    });

    logger.debug('release cover batch completed', {
        releaseGroupId,
        releaseCount: uniqueReleaseIds.length,
        durationMs: Date.now() - startedAt,
    });

    return {
        releaseGroupId,
        covers: resultMap,
    };
};

export const fetchAndUpsertArtistReleaseGroupCovers = async (
    artistId: string,
    pageEntries: ReleaseGroupPageEntry[],
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<ReleaseGroupCoverTaskResult> => {
    const resultMap: { [releaseGroupId: string]: string | null | undefined } = {};
    const artistCoverCacheContext = await createArtistReleaseGroupCoverCacheContext(artistId);
    const startedAt = Date.now();
    let firstError: unknown;

    logger.debug('release-group cover batch started', {
        artistId,
        releaseGroupCount: pageEntries.length,
        ttlHours: ttl ?? null,
    });

    try {
        await mapWithConcurrency(pageEntries, COVER_ART_REQUEST_CONCURRENCY, async (entry) => {
            try {
                const cover = await getReleaseGroupCover(
                    artistId,
                    entry.releaseGroupId,
                    entry.releaseIds,
                    ttl,
                    signal,
                    artistCoverCacheContext,
                );
                resultMap[entry.releaseGroupId] = cover.state.url;
            } catch (error) {
                if (!firstError) {
                    firstError = error;
                }
            }
        });
    } finally {
        await flushArtistReleaseGroupCoverCacheContext(artistId, artistCoverCacheContext, ttl);
    }

    if (firstError) {
        logger.warn('release-group cover batch completed with errors', {
            artistId,
            releaseGroupCount: pageEntries.length,
            durationMs: Date.now() - startedAt,
        });
        throw firstError;
    }

    logger.debug('release-group cover batch completed', {
        artistId,
        releaseGroupCount: pageEntries.length,
        durationMs: Date.now() - startedAt,
    });

    return {
        artistId,
        covers: resultMap,
    };
};

import { getCachedData, replaceCachedData } from '../cacheService.js';
import { getCacheKey } from '../../utils/helpers/cacheHelpers.js';
import type {
    CachedArtistReleaseGroupCovers,
    CachedReleaseGroupReleaseCovers,
    CoverState,
} from '../../utils/types/cacheTypes.js';

export type ArtistReleaseGroupCoverCacheContext = {
    cache: CachedArtistReleaseGroupCovers;
    dirty: boolean;
};

export const readReleaseCoverCache = async (
    releaseGroupId: string,
): Promise<CachedReleaseGroupReleaseCovers> => {
    return (
        (await getCachedData<CachedReleaseGroupReleaseCovers>(
            getCacheKey(releaseGroupId, 'releaseGroupReleaseCovers'),
        )) ?? {}
    );
};

export const writeReleaseCoverCache = async (
    releaseGroupId: string,
    cache: CachedReleaseGroupReleaseCovers,
    ttl: number | undefined,
): Promise<void> => {
    await replaceCachedData(getCacheKey(releaseGroupId, 'releaseGroupReleaseCovers'), cache, ttl);
};

export const readArtistReleaseGroupCoverCache = async (
    artistId: string,
): Promise<CachedArtistReleaseGroupCovers> => {
    return (
        (await getCachedData<CachedArtistReleaseGroupCovers>(
            getCacheKey(artistId, 'artistReleaseGroupCovers'),
        )) ?? {}
    );
};

const writeArtistReleaseGroupCoverCache = async (
    artistId: string,
    cache: CachedArtistReleaseGroupCovers,
    ttl: number | undefined,
): Promise<void> => {
    await replaceCachedData(getCacheKey(artistId, 'artistReleaseGroupCovers'), cache, ttl);
};

const isSameCoverState = (left: CoverState | undefined, right: CoverState): boolean =>
    !!left &&
    left.url === right.url &&
    left.nextRefetchAt === right.nextRefetchAt &&
    left.confirmedMiss === right.confirmedMiss;

export const upsertArtistReleaseGroupCoverState = async (
    artistId: string | undefined,
    artistCoverCache: CachedArtistReleaseGroupCovers | undefined,
    releaseGroupId: string,
    state: CoverState,
    ttl: number | undefined,
    context?: ArtistReleaseGroupCoverCacheContext,
): Promise<void> => {
    if (!artistId || !artistCoverCache) {
        return;
    }

    const current = artistCoverCache[releaseGroupId];
    if (isSameCoverState(current, state)) {
        return;
    }

    artistCoverCache[releaseGroupId] = state;
    if (context) {
        context.dirty = true;
        return;
    }

    await writeArtistReleaseGroupCoverCache(artistId, artistCoverCache, ttl);
};

export const createArtistReleaseGroupCoverCacheContext = async (
    artistId: string,
): Promise<ArtistReleaseGroupCoverCacheContext> => {
    return {
        cache: await readArtistReleaseGroupCoverCache(artistId),
        dirty: false,
    };
};

export const flushArtistReleaseGroupCoverCacheContext = async (
    artistId: string,
    context: ArtistReleaseGroupCoverCacheContext,
    ttl: number | undefined,
): Promise<void> => {
    if (!context.dirty) {
        return;
    }

    await writeArtistReleaseGroupCoverCache(artistId, context.cache, ttl);
    context.dirty = false;
};

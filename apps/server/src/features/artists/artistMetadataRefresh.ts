import { cacheConfig } from '../../config/runtimeConfig.js';

const ARTIST_METADATA_REFRESH_TTL_MS = cacheConfig.artistMetadataRefreshTtlMs;

const ARTIST_METADATA_REFRESH_TTL_HOURS = Math.max(
    1,
    Math.ceil(ARTIST_METADATA_REFRESH_TTL_MS / (1000 * 60 * 60)),
);

export const isArtistMetadataStale = (
    refreshedAt: number | undefined,
    now: number = Date.now(),
): boolean => {
    if (!refreshedAt) {
        return true;
    }

    return now - refreshedAt >= ARTIST_METADATA_REFRESH_TTL_MS;
};

export const getArtistMetadataCacheTtlHours = (requestedTtlHours?: number): number => {
    if (requestedTtlHours === undefined) {
        return ARTIST_METADATA_REFRESH_TTL_HOURS;
    }

    return Math.max(1, Math.min(requestedTtlHours, ARTIST_METADATA_REFRESH_TTL_HOURS));
};

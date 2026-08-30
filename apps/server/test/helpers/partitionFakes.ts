import type { AssetCachePartitioner } from '../../src/services/cache/partitionCachedAssets.js';

/**
 * Default partitioner fake: no cache hits, everything stays pending.
 * Use it as the baseline in use case tests; override methods for
 * cached/mixed scenarios.
 */
export const createDefaultCacheAssetPartitioner = (): AssetCachePartitioner => ({
    partitionArtistProfileImages: async (lookups) => ({
        resolved: {},
        pending: lookups,
    }),
    partitionTrackLyrics: async (_releaseId, tracks) => ({
        resolved: {},
        pending: tracks,
    }),
    partitionReleaseGroupReleaseCovers: async (pageEntries) => ({
        resolved: {},
        pending: pageEntries,
    }),
    partitionArtistReleaseGroupCovers: async (_artistId, pageEntries) => ({
        resolved: {},
        pending: pageEntries,
    }),
});

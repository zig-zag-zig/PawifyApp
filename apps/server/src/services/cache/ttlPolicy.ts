import { cacheConfig } from '../../config/runtimeConfig.js';

// Artist caches use a flat TTL. If a membership-based TTL is ever desired
// (followed artists get a longer lifetime than transient lookups), the TTL
// selection would plug in here, keyed by the user's followed-artist state.
export const artistCacheTtlHours = cacheConfig.artistTtlHours;
export const transientArtistCacheTtlHours = cacheConfig.transientArtistTtlHours;
const releaseLyricsCacheTtlHours = cacheConfig.releaseLyricsTtlHours;

export const getReleaseLyricsTtl = (artistTtl: number | undefined): number => {
    return Math.min(artistTtl ?? releaseLyricsCacheTtlHours, releaseLyricsCacheTtlHours);
};

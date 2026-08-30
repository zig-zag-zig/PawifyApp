import { getArtistMetadataCacheTtlHours } from '../../../features/artists/artistMetadataRefresh.js';
import {
    getExternalLinkUrlsByService,
    mapUrlsToExternalLinks,
} from '../../../utils/helpers/externalLinks.js';
import { getCacheKey } from '../../../utils/helpers/cacheHelpers.js';
import type {
    ArtistWithLegacyDiscogsUrls,
    CachedArtistDetails,
} from '../../../utils/types/cacheTypes.js';
import { getCachedData, replaceCachedData } from '../../cacheService.js';
import { canonicalDiscogsUrls, normalizeDiscogsUrls } from '../backgroundTaskMappers.js';

export const syncArtistDetailsDiscogsUrls = async (
    artistId: string,
    nextDiscogsUrls: string[],
    existingDetails: CachedArtistDetails | null | undefined,
    ttl: number | undefined,
): Promise<boolean> => {
    const cachedArtistDetails =
        existingDetails ??
        (await getCachedData<CachedArtistDetails>(getCacheKey(artistId, 'artistDetails')));
    if (!cachedArtistDetails?.artist) {
        return false;
    }

    const legacyDiscogsUrls = (cachedArtistDetails.artist as ArtistWithLegacyDiscogsUrls)
        .discogsUrls;
    const currentDiscogsUrls = normalizeDiscogsUrls([
        ...getExternalLinkUrlsByService(cachedArtistDetails.artist.externalLinks, 'discogs'),
        ...(Array.isArray(legacyDiscogsUrls) ? legacyDiscogsUrls : []),
    ]);
    const normalizedNextDiscogsUrls = normalizeDiscogsUrls(nextDiscogsUrls);

    if (
        canonicalDiscogsUrls(currentDiscogsUrls) === canonicalDiscogsUrls(normalizedNextDiscogsUrls)
    ) {
        return false;
    }

    const ttlInHours = getArtistMetadataCacheTtlHours(ttl);
    const nonDiscogsLinks = (cachedArtistDetails.artist.externalLinks ?? []).filter(
        (link) => link.service !== 'discogs',
    );
    await replaceCachedData(
        getCacheKey(artistId, 'artistDetails'),
        {
            artist: {
                ...cachedArtistDetails.artist,
                externalLinks: [
                    ...nonDiscogsLinks,
                    ...mapUrlsToExternalLinks(normalizedNextDiscogsUrls, 'discogs'),
                ],
            },
        } satisfies CachedArtistDetails,
        ttlInHours,
    );

    return true;
};

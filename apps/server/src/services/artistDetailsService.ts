import { getArtistMetadataCacheTtlHours } from '../features/artists/artistMetadataRefresh.js';
import { mapToArtist } from '../infrastructure/musicbrainz/musicbrainzMapper.js';
import { mapArtistToFollowedArtistSummary } from '../features/artists/followedArtistSummary.js';
import { Artist } from '@pawify/shared';
import {
    getExternalLinkUrlsByService,
    mapRelationsToExternalLinks,
} from '../utils/helpers/externalLinks.js';
import { replaceCachedData, getCachedData } from './cacheService.js';
import type {
    ArtistWithLegacyDiscogsUrls,
    CachedArtistDetails,
} from '../utils/types/cacheTypes.js';
import { normalizeDiscogsUrls } from './tasks/backgroundTaskMappers.js';
import { fetchMusicBrainzWithStatus } from './musicApi/musicBrainzClient.js';
import { isConfirmedMissingFetchFailure, isFetchFailureResult } from './musicApi/types.js';
import { artistCacheTtlHours } from './cache/ttlPolicy.js';
import { getCacheKey } from '../utils/helpers/cacheHelpers.js';
import type { FollowedArtistSummary } from '../utils/types/followedArtistTypes.js';

const getArtistDiscogsUrls = (artist: Artist): string[] => {
    const discogsUrls = getExternalLinkUrlsByService(artist.externalLinks, 'discogs');
    if (discogsUrls.length > 0) {
        return discogsUrls;
    }

    return normalizeDiscogsUrls((artist as ArtistWithLegacyDiscogsUrls).discogsUrls);
};

const hasExternalLinks = (artist: Artist): boolean =>
    Array.isArray((artist as Artist & { externalLinks?: unknown }).externalLinks);

const fetchArtistData = async (artistId: string, include: string): Promise<unknown | null> => {
    const artistData = await fetchMusicBrainzWithStatus(
        `/artist/${artistId}?fmt=json&inc=${include}`,
    );

    if (isFetchFailureResult(artistData)) {
        if (isConfirmedMissingFetchFailure(artistData)) {
            return null;
        }

        throw new Error(`MusicBrainz artist lookup failed for ${artistId}`);
    }

    return artistData;
};

export const getArtistDetails = async (
    userId: string,
    artistId: string,
): Promise<Artist | null> => {
    const result = await getArtistDetailsRecord(userId, artistId);
    return result?.artist ?? null;
};

export const getFollowedArtistSummary = async (
    _userId: string,
    artistId: string,
): Promise<FollowedArtistSummary | null> => {
    const mapSummaryWithDiscogsUrls = (
        summary: FollowedArtistSummary,
        discogsUrls: string[],
    ): FollowedArtistSummary => {
        const normalized = normalizeDiscogsUrls(discogsUrls);
        if (normalized.length === 0) {
            return summary;
        }

        return {
            ...summary,
            discogsUrls: normalized,
        };
    };

    const cached = await getCachedData<CachedArtistDetails>(getCacheKey(artistId, 'artistDetails'));
    if (cached?.artist) {
        return mapSummaryWithDiscogsUrls(
            mapArtistToFollowedArtistSummary(cached.artist),
            getArtistDiscogsUrls(cached.artist),
        );
    }

    const artistData = await fetchArtistData(artistId, 'url-rels');
    if (artistData === null) {
        return null;
    }

    const artistRecord = artistData as { name?: unknown; relations?: any[] };
    const rawName = typeof artistRecord.name === 'string' ? artistRecord.name.trim() : '';
    const summary = {
        id: artistId,
        name: rawName.length > 0 ? rawName : artistId,
        refreshedAt: Date.now(),
    } satisfies FollowedArtistSummary;

    const externalLinks = mapRelationsToExternalLinks(artistRecord.relations);
    return mapSummaryWithDiscogsUrls(
        summary,
        getExternalLinkUrlsByService(externalLinks, 'discogs'),
    );
};

const fetchArtistDetailsRecord = async (artistId: string): Promise<CachedArtistDetails | null> => {
    const artistData = await fetchArtistData(artistId, 'aliases+artist-rels+url-rels');

    if (artistData === null) {
        return null;
    }

    const mappedArtist = mapToArtist(artistData);

    return {
        artist: mappedArtist,
    };
};

const writeArtistDetailsCache = async (
    artistId: string,
    result: CachedArtistDetails,
    ttl: number | undefined,
): Promise<void> => {
    const ttlInHours = getArtistMetadataCacheTtlHours(ttl);
    await replaceCachedData(
        getCacheKey(artistId, 'artistDetails'),
        {
            artist: result.artist,
        } satisfies CachedArtistDetails,
        ttlInHours,
    );
};

const getArtistDetailsRecord = async (
    _userId: string,
    artistId: string,
): Promise<CachedArtistDetails | null> => {
    const cacheKey = getCacheKey(artistId, 'artistDetails');
    const cached: CachedArtistDetails | null = await getCachedData<CachedArtistDetails>(cacheKey);

    if (cached?.artist && hasExternalLinks(cached.artist)) {
        return {
            artist: cached.artist,
        };
    }

    const result = await fetchArtistDetailsRecord(artistId);
    if (!result) {
        return null;
    }

    const ttl = artistCacheTtlHours;
    await writeArtistDetailsCache(artistId, result, ttl);

    return {
        artist: result.artist,
    };
};

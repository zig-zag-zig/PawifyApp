import { createLogger } from '../../common/logging/logger.js';
import { getCachedData, replaceCachedData } from '../cacheService.js';
import { searchForArtist } from '../musicbrainz/artistSearch.js';
import { searchReleaseGroups as searchReleaseGroupsFromApi } from '../musicbrainz/releaseGroupSearch.js';
import {
    searchArtistsFromMirror,
    searchReleaseGroupsFromMirror,
} from '../../infrastructure/musicDb/musicDbRepositories.js';
import { toFtsQuery } from '../../infrastructure/musicDb/musicDbQueries.js';
import type { ArtistSearchResult } from '../musicbrainz/artistSearch.js';
import type { ReleaseGroupSearchResult } from '../musicbrainz/releaseGroupSearch.js';

const logger = createLogger('services.search.zeroResultFallback');

/**
 * Typo/zero-result fallback cache TTL.
 *
 * Local SQLite FTS5 (`unicode61`) handles normal artist/album/alias/sort-name
 * queries in ~35-70 ms without touching the MusicBrainz 1 req/s budget, but a
 * misspelling inside a token (`bealtes`, `metallcia`, `nirvna`) yields 0 local
 * rows because we do not store a multi-GiB n-gram index. When a tokenised query
 * returns 0 rows locally, we fall back to MusicBrainz's Solr n-gram search and
 * cache the response for an hour so repeat paging/retries are free.
 */
export const ZERO_RESULT_SEARCH_CACHE_TTL_HOURS = 1;

export type SearchWithApiFallbackDependencies = {
    searchArtistsFromMirror(
        query: string,
        offset: number,
        limit: number,
    ): ArtistSearchResult | null;
    searchReleaseGroupsFromMirror(
        query: string,
        offset: number,
        limit: number,
    ): ReleaseGroupSearchResult | null;
    searchArtistsFromApi(
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<ArtistSearchResult>;
    searchReleaseGroupsFromApi(
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<ReleaseGroupSearchResult>;
    readCache<T>(key: string): Promise<T | null>;
    writeCache<T>(key: string, value: T): Promise<void>;
};

const cacheKey = (kind: 'artist' | 'release-group', query: string, offset: number, limit: number): string =>
    `search-fallback:${kind}:${query.trim().toLowerCase()}:${offset}:${limit}`;

const hasSearchableTokens = (query: string): boolean => toFtsQuery(query).length > 0;

export const createSearchWithZeroResultFallback = (deps: SearchWithApiFallbackDependencies) => ({
    searchArtists: async (
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<ArtistSearchResult> => {
        if (!hasSearchableTokens(query)) {
            return { artists: [], count: 0 };
        }

        let mirrorResult: ArtistSearchResult | null = null;
        try {
            mirrorResult = deps.searchArtistsFromMirror(query, offset, limit);
            if (mirrorResult && mirrorResult.artists.length > 0) {
                return mirrorResult;
            }
        } catch (error) {
            logger.warn('mirror artist search failed; falling back to MusicBrainz API', {
                query,
                offset,
                limit,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        // If the mirror has matches overall (`count > 0`) and only this high offset
        // slice is empty, do not hit the API past the end of the local result set.
        if (mirrorResult && mirrorResult.count > 0 && offset > 0) {
            return mirrorResult;
        }

        const key = cacheKey('artist', query, offset, limit);
        const cached = await deps.readCache<ArtistSearchResult>(key);
        if (cached) {
            return cached;
        }

        try {
            const apiResult = await deps.searchArtistsFromApi(userId, query, offset, limit);
            await deps.writeCache(key, apiResult);
            return apiResult;
        } catch (error) {
            if (mirrorResult) {
                logger.warn('MusicBrainz artist typo-fallback failed; returning empty local result', {
                    query,
                    offset,
                    limit,
                    error: error instanceof Error ? error.message : String(error),
                });
                return mirrorResult;
            }
            throw error;
        }
    },

    searchReleaseGroups: async (
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<ReleaseGroupSearchResult> => {
        if (!hasSearchableTokens(query)) {
            return { releaseGroups: [], count: 0 };
        }

        let mirrorResult: ReleaseGroupSearchResult | null = null;
        try {
            mirrorResult = deps.searchReleaseGroupsFromMirror(query, offset, limit);
            if (mirrorResult && mirrorResult.releaseGroups.length > 0) {
                return mirrorResult;
            }
        } catch (error) {
            logger.warn('mirror release-group search failed; falling back to MusicBrainz API', {
                query,
                offset,
                limit,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        if (mirrorResult && mirrorResult.count > 0 && offset > 0) {
            return mirrorResult;
        }

        const key = cacheKey('release-group', query, offset, limit);
        const cached = await deps.readCache<ReleaseGroupSearchResult>(key);
        if (cached) {
            return cached;
        }

        try {
            const apiResult = await deps.searchReleaseGroupsFromApi(userId, query, offset, limit);
            await deps.writeCache(key, apiResult);
            return apiResult;
        } catch (error) {
            if (mirrorResult) {
                logger.warn(
                    'MusicBrainz release-group typo-fallback failed; returning empty local result',
                    {
                        query,
                        offset,
                        limit,
                        error: error instanceof Error ? error.message : String(error),
                    },
                );
                return mirrorResult;
            }
            throw error;
        }
    },
});

export const searchWithZeroResultFallback = createSearchWithZeroResultFallback({
    searchArtistsFromMirror,
    searchReleaseGroupsFromMirror,
    searchArtistsFromApi: searchForArtist,
    searchReleaseGroupsFromApi,
    readCache: async <T>(key: string): Promise<T | null> => {
        try {
            return await getCachedData<T>(key);
        } catch {
            return null;
        }
    },
    writeCache: async <T>(key: string, value: T): Promise<void> => {
        try {
            await replaceCachedData(key, value, ZERO_RESULT_SEARCH_CACHE_TTL_HOURS);
        } catch {
            // Non-fatal: response is still valid even if Redis is unavailable.
        }
    },
});

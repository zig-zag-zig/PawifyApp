import type { ArtistSearchResult } from '../../modules/models/models.js';
import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';
import { createLogger } from '../../common/logging/logger.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';

const logger = createLogger('helpers.artistSearch');
const SEARCH_ATTEMPT_COUNT = 3;

type MusicBrainzArtistSearchResponse = {
    artists: unknown[];
    count: number;
};

const parseMusicBrainzArtistSearchResponse = (
    response: unknown,
): MusicBrainzArtistSearchResponse => {
    if (
        !isPlainObject(response) ||
        !Array.isArray(response.artists) ||
        typeof response.count !== 'number'
    ) {
        throw new Error('MusicBrainz returned an invalid artist search response');
    }

    return {
        artists: response.artists,
        count: Number.isFinite(response.count) ? Math.max(0, response.count) : 0,
    };
};

const fetchArtistSearchResponse = async (
    query: string,
    offset: number,
    limit: number,
): Promise<MusicBrainzArtistSearchResponse> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= SEARCH_ATTEMPT_COUNT; attempt += 1) {
        try {
            const response = await fetchMusicBrainz(
                `/artist?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}&offset=${offset}`,
            );
            return parseMusicBrainzArtistSearchResponse(response);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError;
};

const search = async (
    _userId: string,
    query: string,
    offset: number,
    limit: number,
): Promise<ArtistSearchResult> => {
    try {
        const response = await fetchArtistSearchResponse(query, offset, limit);

        const artists = response.artists
            .filter((artist: unknown): artist is { id: string; name: string } => {
                if (!isPlainObject(artist)) {
                    return false;
                }

                return typeof artist.id === 'string' && typeof artist.name === 'string';
            })
            .map((artist: { id: string; name: string }) => ({
                id: artist.id,
                name: artist.name,
            }));

        return {
            artists,
            count: response.count,
        };
    } catch (error) {
        logger.error('artist search failed', { query, offset, limit, error });
        throw Object.assign(new Error('Failed to search for artists'), { cause: error });
    }
};

export const searchForArtist = async (
    userId: string,
    query: string,
    offset: number,
    limit: number,
): Promise<ArtistSearchResult> => {
    return await search(userId, query, offset, limit);
};

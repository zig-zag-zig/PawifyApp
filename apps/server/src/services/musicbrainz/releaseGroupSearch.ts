import type { ArtistCredit } from '@pawify/shared';
import { fetchMusicBrainzWithStatus } from '../musicApi/musicBrainzClient.js';
import { isFetchFailureResult } from '../musicApi/types.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';

export interface ReleaseGroupSearchResultItem {
    id: string;
    title: string;
    'primary-type': string | null;
    'first-release-date': string | null;
    'artist-credit': ArtistCredit[];
}

export interface ReleaseGroupSearchResult {
    releaseGroups: ReleaseGroupSearchResultItem[];
    count: number;
}

const SEARCH_ATTEMPT_COUNT = 3;

type MusicBrainzReleaseGroupSearchResponse = {
    'release-groups': unknown[];
    count: number;
};

const parseMusicBrainzReleaseGroupSearchResponse = (
    response: unknown,
): MusicBrainzReleaseGroupSearchResponse => {
    if (
        !isPlainObject(response) ||
        !Array.isArray(response['release-groups']) ||
        typeof response.count !== 'number'
    ) {
        throw new Error('MusicBrainz returned an invalid release-group search response');
    }

    return {
        'release-groups': response['release-groups'],
        count: Number.isFinite(response.count) ? Math.max(0, response.count) : 0,
    };
};

const toArtistCredit = (value: unknown): ArtistCredit | null => {
    if (!isPlainObject(value) || !isPlainObject(value.artist)) {
        return null;
    }

    const { artist } = value;
    if (typeof artist.id !== 'string' || typeof artist.name !== 'string') {
        return null;
    }

    return {
        id: artist.id,
        name: artist.name,
        joinphrase: typeof value.joinphrase === 'string' ? value.joinphrase : null,
    };
};

const toReleaseGroupSearchItem = (value: unknown): ReleaseGroupSearchResultItem | null => {
    if (!isPlainObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
        return null;
    }

    return {
        id: value.id,
        title: value.title,
        'primary-type': typeof value['primary-type'] === 'string' ? value['primary-type'] : null,
        'first-release-date':
            typeof value['first-release-date'] === 'string' ? value['first-release-date'] : null,
        'artist-credit': Array.isArray(value['artist-credit'])
            ? value['artist-credit'].flatMap((credit) => {
                  const parsed = toArtistCredit(credit);
                  return parsed ? [parsed] : [];
              })
            : [],
    };
};

const fetchReleaseGroupSearchResponse = async (
    query: string,
    offset: number,
    limit: number,
): Promise<MusicBrainzReleaseGroupSearchResponse> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= SEARCH_ATTEMPT_COUNT; attempt += 1) {
        try {
            const response = await fetchMusicBrainzWithStatus(
                `/release-group?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}&offset=${offset}`,
            );

            if (isFetchFailureResult(response)) {
                // Distinguish an upstream outage/rate-limit (MusicBrainz answers 503
                // "busy" when throttling) from a malformed payload, so the logged
                // cause and the client-visible failure reflect what actually happened.
                throw new Error(
                    `MusicBrainz release-group search failed${
                        response.status === null ? '' : ` (status ${response.status})`
                    }`,
                );
            }

            return parseMusicBrainzReleaseGroupSearchResponse(response);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError;
};

/**
 * Searches MusicBrainz release groups. Free text matches the release-group
 * title and credited artists; MusicBrainz query syntax (e.g.
 * `releasegroup:"ok computer" AND artist:"radiohead"`) is passed through
 * untouched.
 */
export const searchReleaseGroups = async (
    _userId: string,
    query: string,
    offset: number,
    limit: number,
): Promise<ReleaseGroupSearchResult> => {
    const response = await fetchReleaseGroupSearchResponse(query, offset, limit);

    const releaseGroups = response['release-groups'].flatMap((group) => {
        const parsed = toReleaseGroupSearchItem(group);
        return parsed ? [parsed] : [];
    });

    return { releaseGroups, count: response.count };
};

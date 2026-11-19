import { getGeniusAccessToken, logMissingOptionalCredentialOnce } from './credentials.js';
import { fetchDaprProvider, isAbortError } from './httpClient.js';
import { isFetchFailureResult } from './types.js';
import type { HttpOptions } from './types.js';

export type GeniusLyricsResult =
    { status: 'found'; url: string } | { status: 'miss' } | { status: 'failure' };

const isAcceptableHit = (hit: any, artistName: string, trackName: string): boolean =>
    typeof hit?.result?.artist_names === 'string' &&
    typeof hit?.result?.title === 'string' &&
    hit.result.artist_names.toLowerCase().includes(artistName.toLowerCase().trim()) &&
    hit.result.title.toLowerCase().trim() === trackName.toLowerCase().trim() &&
    hit.result.lyrics_state === 'complete' &&
    typeof hit.result.url === 'string' &&
    hit.result.url.length > 0;

/**
 * Genius search is the first upstream lyrics provider.
 *
 * The tri-state answer is deliberate: `miss` is a provider-confirmed absence and
 * opens the MusicBrainz fallback, while `failure` (missing token, rate limit,
 * network/5xx) keeps the Genius retry state and must not become a permanent miss.
 */
export const fetchGeniusLyrics = async (
    artistName: string,
    trackName: string,
    signal?: AbortSignal,
): Promise<GeniusLyricsResult> => {
    const token = await getGeniusAccessToken();
    if (!token) {
        logMissingOptionalCredentialOnce('genius-access-token');
        return { status: 'failure' };
    }

    const queryEncoded = encodeURIComponent(`${trackName} ${artistName}`);
    const options: HttpOptions = {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };

    try {
        const response = await fetchDaprProvider(
            'genius',
            `/search?q=${queryEncoded}`,
            options,
            false,
            false,
            'status',
            signal,
        );
        if (!response || isFetchFailureResult(response)) {
            return { status: 'failure' };
        }

        const hits = response.response.hits as unknown[];
        if (!Array.isArray(hits)) {
            return { status: 'failure' };
        }

        for (const hit of hits) {
            if (isAcceptableHit(hit, artistName, trackName)) {
                return { status: 'found', url: (hit as any).result.url };
            }
        }

        return { status: 'miss' };
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return { status: 'failure' };
    }
};

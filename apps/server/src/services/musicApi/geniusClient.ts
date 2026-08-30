import { getGeniusAccessToken, logMissingOptionalCredentialOnce } from './credentials.js';
import { fetchDaprProvider, isAbortError } from './httpClient.js';
import { isFetchFailureResult } from './types.js';
import type { HttpOptions } from './types.js';

export const fetchGeniusLyrics = async (
    artistName: string,
    trackName: string,
    signal?: AbortSignal,
): Promise<string | null | undefined> => {
    const token = await getGeniusAccessToken();
    if (!token) {
        logMissingOptionalCredentialOnce('genius-access-token');
        return undefined;
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
            return undefined;
        }

        const hits = response.response.hits as any[];

        for (const hit of hits) {
            if (
                hit.result.artist_names.toLowerCase().includes(artistName.toLowerCase().trim()) &&
                hit.result.title.toLowerCase().trim() === trackName.toLowerCase().trim()
            ) {
                return hit.result.url ?? null;
            }
        }

        return null;
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return undefined;
    }
};

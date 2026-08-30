import { fetchDaprProvider } from './httpClient.js';
import type { FetchFailureResult, HttpOptions, MusicBrainzPriority } from './types.js';

export const fetchMusicBrainzWithStatus = async (
    endpoint: string,
    method: 'GET' | 'HEAD' = 'GET',
    signal?: AbortSignal,
    priority: MusicBrainzPriority = 'foreground',
): Promise<unknown | FetchFailureResult> => {
    const options: HttpOptions = {
        method,
        headers: {},
    };
    return await fetchDaprProvider(
        'musicbrainz',
        `/ws/2${endpoint}`,
        options,
        true,
        false,
        'status',
        signal,
        priority,
    );
};

export const fetchMusicBrainz = async (
    endpoint: string,
    method: 'GET' | 'HEAD' = 'GET',
    signal?: AbortSignal,
    priority: MusicBrainzPriority = 'foreground',
) => {
    const options: HttpOptions = {
        method,
        headers: {},
    };
    return await fetchDaprProvider(
        'musicbrainz',
        `/ws/2${endpoint}`,
        options,
        true,
        false,
        'null',
        signal,
        priority,
    );
};

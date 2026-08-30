import { fetchDaprProvider, isAbortError } from './httpClient.js';
import { isConfirmedMissingFetchFailure } from './types.js';
import type { HttpOptions } from './types.js';

const coverArtInFlight = new Map<string, Promise<string | null | undefined>>();
type CoverProbeResult = 'found' | 'missing' | 'transient';

const getPublicCoverArtUrl = (path: string): string => `https://coverartarchive.org${path}`;

const normalizeCoverArtPath = (value: string): string => {
    try {
        const parsed = new URL(value);
        return parsed.pathname + parsed.search;
    } catch {
        return value.startsWith('/') ? value : `/${value}`;
    }
};

export const getCoverArtArchiveUrl = async (
    basePath: string,
    signal?: AbortSignal,
): Promise<string | null | undefined> => {
    const normalizedBasePath = normalizeCoverArtPath(basePath);

    if (signal) {
        return await fetchCoverArt(normalizedBasePath, signal);
    }

    const existing = coverArtInFlight.get(normalizedBasePath);
    if (existing) {
        return await existing;
    }

    const promise = fetchCoverArt(normalizedBasePath);
    coverArtInFlight.set(normalizedBasePath, promise);
    promise.finally(() => coverArtInFlight.delete(normalizedBasePath));

    return await promise;
};

const fetchCoverArt = async (
    path: string,
    signal?: AbortSignal,
): Promise<string | null | undefined> => {
    const thumbnailPath = `${path}-500`;
    const thumbnailResult = await probeCoverUrl(thumbnailPath, signal);
    if (thumbnailResult === 'found') {
        return getPublicCoverArtUrl(thumbnailPath);
    }

    const originalResult = await probeCoverUrl(path, signal);
    if (originalResult === 'found') {
        return getPublicCoverArtUrl(path);
    }

    if (thumbnailResult === 'transient' || originalResult === 'transient') {
        return undefined;
    }

    return null;
};

const probeCoverUrl = async (path: string, signal?: AbortSignal): Promise<CoverProbeResult> => {
    const options: HttpOptions = {
        method: 'HEAD',
        headers: {},
    };

    try {
        const result = await fetchDaprProvider(
            'coverartarchive',
            path,
            options,
            true,
            true,
            'status',
            signal,
        );
        if (result === true) {
            return 'found';
        }

        if (isConfirmedMissingFetchFailure(result)) {
            return 'missing';
        }

        return 'transient';
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        return 'transient';
    }
};

export type MusicBrainzPriority = 'foreground' | 'background';

export type HttpOptions = {
    method: 'HEAD' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers: {
        'User-Agent'?: string;
        Authorization?: string;
        'x-tidal-token'?: string;
    };
};

export type FetchFailureResult = {
    __fetchFailure: true;
    status: number | null;
};

export const isFetchFailureResult = (value: unknown): value is FetchFailureResult => {
    return (
        value !== null &&
        typeof value === 'object' &&
        (value as FetchFailureResult).__fetchFailure === true &&
        ((value as FetchFailureResult).status === null ||
            typeof (value as FetchFailureResult).status === 'number')
    );
};

export const isConfirmedMissingFetchFailure = (value: unknown): value is FetchFailureResult => {
    return isFetchFailureResult(value) && (value.status === 404 || value.status === 410);
};

export type DiscogsResult = {
    image: string | null | undefined;
};

/**
 * Providers consulted for an artist profile image, in resolution order.
 */
export type ArtistImageProvider = 'deezer' | 'tidal' | 'discogs';

/**
 * Repo-wide tri-state for a remote value lookup:
 * - a non-empty string: the value was found.
 * - null: the provider answered and definitively has no value. Cacheable as a
 *   confirmed miss, so it is not retried until the cache entry expires.
 * - undefined: the lookup failed transiently (rate limit, 5xx, auth, network).
 *   Cached with a short retry window rather than treated as a miss.
 */
export type ProviderValueState = string | null | undefined;

export type ArtistImageLookupOptions = {
    /** MusicBrainz's artist name, used to prefer the matching provider profile. */
    artistName?: string;
    signal?: AbortSignal;
};

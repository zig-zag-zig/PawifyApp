import { dedupeStrings } from '../../common/utils/array.js';
import { isRemoteValueState } from '../../common/utils/objectGuards.js';
import type { CachedArtistImage, CoverState, LyricsState } from '../../utils/types/cacheTypes.js';
import type { TrackLyricsRequest } from '../../utils/types/taskTypes.js';
import {
    mapLyricsState,
    shouldRefetchRemoteState,
    TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
} from '../../utils/helpers/remoteStateHelpers.js';

export const shouldRefetchState = (
    state: CoverState | LyricsState | undefined,
    now: number = Date.now(),
): boolean => {
    if (state && !isRemoteValueState(state.url)) {
        return true;
    }

    if (state?.url === null && state.confirmedMiss !== true) {
        return true;
    }

    return shouldRefetchRemoteState(state, now);
};

export const mapLyricsToState = (url: string | null | undefined): LyricsState => {
    return mapLyricsState(url);
};

export const mapArtistImageToState = (url: string | null | undefined): CachedArtistImage => {
    const refreshedAt = Date.now();

    if (typeof url === 'string' && url.trim().length > 0) {
        return {
            url,
            nextRefetchAt: undefined,
            refreshedAt,
        };
    }

    if (url === null) {
        return {
            url: null,
            refreshedAt,
            confirmedMiss: true,
        };
    }

    return {
        url: undefined,
        nextRefetchAt: refreshedAt + TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
        refreshedAt,
    };
};

export const normalizeDiscogsUrls = (urls: unknown): string[] => {
    if (!Array.isArray(urls)) {
        return [];
    }

    return dedupeStrings(
        urls
            .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
            .map((url) => url.trim()),
    );
};

export const canonicalDiscogsUrls = (urls: string[]): string =>
    [...urls].sort((left, right) => left.localeCompare(right)).join('|');

export const shouldRefetchArtistImageState = (
    state: CoverState | undefined,
    now: number = Date.now(),
): boolean => {
    if (state && !isRemoteValueState(state.url)) {
        return true;
    }

    if (state?.url === null && state.confirmedMiss !== true) {
        return true;
    }

    return shouldRefetchRemoteState(state, now);
};

export const normalizeArtistImageState = (
    state: CoverState & { refreshedAt?: number; url?: unknown },
): CachedArtistImage => {
    return {
        url: isRemoteValueState(state.url) ? state.url : undefined,
        nextRefetchAt: state.nextRefetchAt,
        confirmedMiss: typeof state.confirmedMiss === 'boolean' ? state.confirmedMiss : undefined,
        refreshedAt: state.refreshedAt ?? Date.now(),
    };
};

export const hasLegacyArtistImageFields = (state: CachedArtistImage): boolean => {
    const legacyState = state as CachedArtistImage & {
        artistName?: string;
        discogsUrls?: string[];
    };

    return (
        legacyState.refreshedAt === undefined ||
        !isRemoteValueState(legacyState.url) ||
        legacyState.artistName !== undefined ||
        legacyState.discogsUrls !== undefined
    );
};

export const dedupeTracks = (tracks: TrackLyricsRequest[]): TrackLyricsRequest[] => {
    const seen = new Set<string>();
    const result: TrackLyricsRequest[] = [];

    for (const track of tracks) {
        const key = track.trackId || `${track.artistName}::${track.trackName}`.toLowerCase().trim();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(track);
    }

    return result;
};

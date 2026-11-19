import { dedupeStrings } from '../../common/utils/array.js';
import type { CachedArtistImage } from '../../utils/types/cacheTypes.js';
import type { TrackLyricsRequest } from '../../utils/types/taskTypes.js';
import { TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS } from '../../utils/helpers/remoteStateHelpers.js';

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

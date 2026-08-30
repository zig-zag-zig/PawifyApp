import type {
    Artist,
    ArtistReleaseGroup,
    Release,
    RemoteValueState,
} from '@pawify/shared';

export type CoverState = {
    url: RemoteValueState;
    nextRefetchAt?: number;
    confirmedMiss?: boolean;
};

export type LyricsState = {
    url: RemoteValueState;
    nextRefetchAt?: number;
    confirmedMiss?: boolean;
};

export type CachedArtistReleases = ArtistReleaseGroup[];

export type CachedReleaseGroupReleases = Release[];

export type CachedArtistDetails = {
    artist: Artist;
};

/**
 * Legacy cached artists may carry `discogsUrls` alongside `externalLinks`.
 * The field is only read (never written); new cache entries store discogs urls
 * as external links instead.
 */
export type ArtistWithLegacyDiscogsUrls = Artist & { discogsUrls?: string[] };

export type CachedArtistImage = CoverState & {
    refreshedAt: number;
};

export type CachedArtistReleaseGroupCovers = {
    [releaseGroupId: string]: CoverState;
};

export type CachedReleaseGroupReleaseCovers = {
    [releaseId: string]: CoverState;
};

export type CachedReleaseLyricsByRelease = {
    [trackId: string]: LyricsState;
};

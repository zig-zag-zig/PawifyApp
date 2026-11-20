import type { ArtistReleaseGroup, RemoteValueState } from '@pawify/shared';

export type CoverState = {
    url: RemoteValueState;
    nextRefetchAt?: number;
    confirmedMiss?: boolean;
};

export type CachedArtistReleases = ArtistReleaseGroup[];

export type CachedArtistImage = CoverState & {
    refreshedAt: number;
};

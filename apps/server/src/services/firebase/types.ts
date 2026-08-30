import type { NewRelease } from '../../modules/models/models.js';
import type { FollowedArtistSummary } from '../../utils/types/followedArtistTypes.js';
import type { ReleaseGroupReleasesPageEntry } from '../../utils/types/taskTypes.js';

export type ArtistsAndReleasesMap = {
    [artistId: string]: string[];
};

export type NewReleasesMap = {
    [releaseId: string]: NewRelease;
};

export type StoredNewRelease = NewRelease & {
    releaseGroupId: string | null;
};

export type StoredNewReleasesMap = {
    [releaseId: string]: StoredNewRelease;
};

export type FollowedArtistsMap = {
    [artistId: string]: FollowedArtistSummary;
};

export type NewReleasesSnapshot = {
    newReleasesMap: NewReleasesMap;
    coverPageEntries: ReleaseGroupReleasesPageEntry[];
};

export type FollowingArtistDocument = FollowedArtistSummary & {
    updatedAt: number;
};

export type FollowingArtistsMap = {
    [artistId: string]: FollowingArtistDocument;
};

export type MissingReleaseCleanupResult = {
    affectedUserIds: string[];
    removedFromNewReleasesUserIds: string[];
};

export type RequestWithAuthHeader = {
    headers: {
        authorization?: string;
    };
};

export const UNAUTH_MESSAGE = 'Invalid or expired token';

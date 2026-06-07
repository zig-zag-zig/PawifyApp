import type {
  Artist,
  ArtistMinimal,
  ArtistReleaseGroup,
  NewReleasesResult,
  Release,
  ReleaseGroupReleaseListItem,
  ReleaseNotificationSettings
} from '../shared/music';

export interface FollowingResponse {
  artists: ArtistMinimal[];
  profileImageTaskId: string;
}

export interface ArtistDetailsResponse {
  artist: Artist;
  profileImageTaskId: string;
}

export interface SearchArtistsResponse {
  artists: Artist[];
  count: number;
  profileImageTaskId: string;
}

export interface ArtistReleasesResponse {
  releaseGroups: ArtistReleaseGroup[];
  releaseGroupCoverTaskId: string;
}

export interface ReleaseGroupReleasesResponse {
  releases: ReleaseGroupReleaseListItem[];
  releaseCoverTaskId: string;
}

export interface ReleaseResponse {
  release: Release;
  lyricsTaskId: string;
  profileImageTaskId: string;
}

export type NewReleasesResponse = NewReleasesResult;
export type ReleaseNotificationSettingsResponse = ReleaseNotificationSettings;

export interface TaskResultResponse<T = unknown> {
  taskId: string;
  type: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  result?: T;
  error?: unknown;
  parentTaskId?: string;
  subtaskIds?: string[];
  completedSubtaskIds?: string[];
  subtaskCount?: number;
  completedSubtaskCount?: number;
}

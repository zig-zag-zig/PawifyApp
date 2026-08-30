import type {
  Artist,
  ArtistMinimal,
  ArtistReleaseGroup,
  NewRelease,
  Release,
  ReleaseGroupReleaseListItem,
  ReleaseNotificationSettings
} from '../shared/music';

export interface FollowingResponse {
  artists: ArtistMinimal[];
  profileImageTaskId: string | null;
  profileImages: Record<string, string | null>;
}

export interface ArtistDetailsResponse {
  artist: Artist;
  profileImageTaskId: string | null;
  profileImages: Record<string, string | null>;
}

export interface SearchArtistsResponse {
  artists: Artist[];
  count: number;
  profileImageTaskId: string | null;
  profileImages: Record<string, string | null>;
}

export interface ArtistReleasesResponse {
  releaseGroups: ArtistReleaseGroup[];
  releaseGroupCoverTaskId: string | null;
  releaseGroupCovers: Record<string, string | null>;
}

export interface ReleaseGroupReleasesResponse {
  releases: ReleaseGroupReleaseListItem[];
  releaseCoverTaskId: string | null;
  releaseCovers: Record<string, string | null>;
}

export interface ReleaseResponse {
  release: Release;
  lyricsTaskId: string | null;
  profileImageTaskId: string | null;
  trackLyrics: Record<string, string | null>;
  profileImages: Record<string, string | null>;
}

export interface NewReleasesResponse {
  releases: NewRelease[];
  releaseCoverTaskId: string | null;
  releaseCovers: Record<string, string | null>;
}
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

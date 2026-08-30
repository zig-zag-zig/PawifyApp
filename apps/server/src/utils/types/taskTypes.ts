import type { NewReleaseCoverTaskResult } from '@pawify/shared';
import type { RemoteValueState } from '@pawify/shared';

export type { NewReleaseCoverTaskResult } from '@pawify/shared';

export type ArtistProfileImageTaskResult = {
    artists: { [artistId: string]: RemoteValueState };
};

export type ReleaseGroupCoverTaskResult = {
    artistId: string;
    covers: { [releaseGroupId: string]: RemoteValueState };
};

export type ReleaseGroupReleaseCoverTaskResult = {
    releaseGroupId: string;
    covers: { [releaseId: string]: RemoteValueState };
};

export type TrackLyricsTaskResult = {
    releaseId: string;
    tracks: { [trackId: string]: RemoteValueState };
};

export type BackgroundTaskType =
    | 'release_group_covers'
    | 'release_group_release_covers'
    | 'new_release_covers'
    | 'release_tracks_lyrics'
    | 'artist_profile_images';

export type BackgroundTaskStatus = 'pending' | 'completed' | 'failed';

export type TrackLyricsRequest = {
    releaseId: string;
    trackId: string;
    artistName: string;
    trackName: string;
};

export type ArtistProfileImageLookup = {
    artistId: string;
    artistName?: string;
    discogsUrls?: string[];
};

/**
 * API contract namespace. v2 prefixes its task dedupe keys so v1 and v2
 * clients never collide on the same background task.
 */
export type ContractNamespace = 'v1' | 'v2';

export type ArtistProfileImageQueueOptions = {
    /** Full artist id set used for dedupe when only a pending subset is queued. */
    fullArtistIds?: string[];
    /** v2 prefixes dedupe keys with 'v2:'. Defaults to v1 keys. */
    contractNamespace?: ContractNamespace;
};

export type ReleaseGroupPageEntry = {
    releaseGroupId: string;
    releaseIds: string[];
};

export type ReleaseGroupReleasesPageEntry = {
    releaseGroupId: string;
    releaseIds: string[];
};

export type BackgroundTaskResultPayload =
    | ReleaseGroupCoverTaskResult
    | ReleaseGroupReleaseCoverTaskResult
    | NewReleaseCoverTaskResult
    | TrackLyricsTaskResult
    | ArtistProfileImageTaskResult;

export interface BackgroundTaskRecord<T = unknown> {
    id: string;
    userIds: string[];
    type: BackgroundTaskType;
    status: BackgroundTaskStatus;
    createdAt: number;
    completedAt?: number;
    result?: T;
    error?: string;
    parentTaskId?: string;
    subtaskIds?: string[];
    completedSubtaskIds?: string[];
    subtaskCount?: number;
    completedSubtaskCount?: number;
    notifyOnCompletion?: boolean;
}

export type TaskResultResponse<T = unknown> = {
    taskId: string;
    type: BackgroundTaskType;
    status: BackgroundTaskStatus;
    createdAt: number;
    completedAt?: number;
    result?: T;
    error?: string;
    parentTaskId?: string;
    subtaskIds?: string[];
    completedSubtaskIds?: string[];
    subtaskCount?: number;
    completedSubtaskCount?: number;
};

export type TaskSessionController<T = BackgroundTaskResultPayload> = {
    taskId: string;
    submitPage: (worker: (signal: AbortSignal) => Promise<Partial<T> | void>) => void;
    finalize: () => void;
};

export type CompositeTaskSessionController<T = BackgroundTaskResultPayload> = {
    taskId: string;
    submitSubtask: (submitPages: (session: TaskSessionController<T>) => void) => string | null;
    finalize: () => void;
};

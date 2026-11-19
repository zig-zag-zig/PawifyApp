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
    /** Release-scoped track row id, used as the client-facing result key. */
    trackId: string;
    /** Real MusicBrainz recording id when known, used for durable lyric identity. */
    recordingId?: string | null;
    artistName: string;
    trackName: string;
};

export type ArtistProfileImageLookup = {
    artistId: string;
    artistName?: string;
    discogsUrls?: string[];
    deezerUrls?: string[];
    tidalUrls?: string[];
};

/**
 * Current API contract namespace. Only v3 exists; the prefix keeps task dedupe
 * keys from colliding with pre-cutover inflight tasks, which are expired rather
 * than replayed into the new contract.
 */
export type ContractNamespace = 'v3';

export type ArtistProfileImageQueueOptions = {
    /** Full artist id set used for dedupe when only a pending subset is queued. */
    fullArtistIds?: string[];
    contractNamespace?: ContractNamespace;
};

export type ReleaseGroupPageEntry = {
    releaseGroupId: string;
    releaseIds: string[];
};

export type ReleaseGroupReleasesPageEntry = {
    /**
     * Release-group identity. `null` for feed entries stored before new-release
     * detection switched from releases to release groups; those are resolved one
     * release at a time.
     */
    releaseGroupId: string | null;
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

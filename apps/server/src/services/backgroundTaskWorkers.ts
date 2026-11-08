import {
    createBackgroundTaskSession,
    createCompositeBackgroundTaskSession,
} from './taskService.js';
import { createLogger } from '../common/logging/logger.js';
import { backgroundTaskConfig } from '../config/runtimeConfig.js';
import { chunkArray, dedupeStrings } from '../common/utils/array.js';
import {
    fetchAndUpsertArtistReleaseGroupCovers,
    fetchAndUpsertNewReleaseGroupCovers,
    fetchAndUpsertReleaseGroupReleaseCovers,
} from './tasks/workers/coverTaskWorker.js';
import { fetchAndUpsertTrackLyrics } from './tasks/workers/trackLyricsTaskWorker.js';
import { fetchAndUpsertArtistProfileImages } from './tasks/workers/artistProfileImageTaskWorker.js';
import type {
    ArtistProfileImageTaskResult,
    ArtistProfileImageLookup,
    ContractNamespace,
    NewReleaseCoverTaskResult,
    ReleaseGroupCoverTaskResult,
    ReleaseGroupPageEntry,
    ReleaseGroupReleaseCoverTaskResult,
    ReleaseGroupReleasesPageEntry,
    BackgroundTaskResultPayload,
    BackgroundTaskType,
    TaskSessionController,
    TrackLyricsRequest,
    TrackLyricsTaskResult,
} from '../utils/types/taskTypes.js';

const logger = createLogger('services.backgroundTasks');

/**
 * Namespaces task dedupe keys per API contract so v1 and v2 never share
 * background tasks for the same logical payload.
 */
export const withTaskKeyNamespace = (
    contractNamespace: ContractNamespace | undefined,
    key: string,
): string => (contractNamespace === 'v2' ? `v2:${key}` : key);

type QueueChunkedTaskOptions<T extends BackgroundTaskResultPayload, TChunk> = {
    userId: string;
    type: BackgroundTaskType;
    dedupeKey: string;
    initialResult: T;
    chunks: TChunk[];
    submitChunk: (session: TaskSessionController<T>, chunk: TChunk) => void;
};

const SUBTASK_ITEM_LIMIT = backgroundTaskConfig.subtaskItemLimit;

/**
 * Chunk size for cover pages.
 *
 * Every surface now pages its images, so one request's covers should be one task:
 * splitting a 60-group artist page into 30+30 halved the usable concurrency and
 * pushed the page into two sequential waves. Cover work is bounded by the worker
 * timeout, not by this number, so a whole page fits comfortably.
 */
const COVER_PAGE_CHUNK_SIZE = 120;

const queueChunkedTask = <T extends BackgroundTaskResultPayload, TChunk>({
    userId,
    type,
    dedupeKey,
    initialResult,
    chunks,
    submitChunk,
}: QueueChunkedTaskOptions<T, TChunk>): string => {
    if (chunks.length > 1) {
        const session = createCompositeBackgroundTaskSession<T>(userId, type, {
            dedupeKey,
            initialResult,
        });

        if (session.reused) {
            logger.info('background composite task reused', {
                taskId: session.taskId,
                taskType: type,
                chunkCount: chunks.length,
                subtaskItemLimit: SUBTASK_ITEM_LIMIT,
            });
            return session.taskId;
        }

        for (const chunk of chunks) {
            session.submitSubtask((subtaskSession) => {
                submitChunk(subtaskSession, chunk);
            });
        }

        session.finalize();
        logger.info('background composite task queued', {
            taskId: session.taskId,
            taskType: type,
            chunkCount: chunks.length,
            subtaskItemLimit: SUBTASK_ITEM_LIMIT,
        });
        return session.taskId;
    }

    const session = createBackgroundTaskSession<T>(userId, type, {
        dedupeKey,
        initialResult,
    });

    if (session.reused) {
        return session.taskId;
    }

    for (const chunk of chunks) {
        submitChunk(session, chunk);
    }

    session.finalize();
    return session.taskId;
};

const chunkReleaseGroupReleasePageEntries = (
    pageEntries: ReleaseGroupReleasesPageEntry[],
    chunkSize = SUBTASK_ITEM_LIMIT,
): ReleaseGroupReleasesPageEntry[][] => {
    const chunks: ReleaseGroupReleasesPageEntry[][] = [];
    let currentChunk: ReleaseGroupReleasesPageEntry[] = [];
    let currentItemCount = 0;

    const flushCurrentChunk = () => {
        if (currentChunk.length === 0) {
            return;
        }

        chunks.push(currentChunk);
        currentChunk = [];
        currentItemCount = 0;
    };

    for (const entry of pageEntries) {
        for (const releaseIdChunk of chunkArray(dedupeStrings(entry.releaseIds), chunkSize)) {
            if (currentItemCount > 0 && currentItemCount + releaseIdChunk.length > chunkSize) {
                flushCurrentChunk();
            }

            currentChunk.push({
                releaseGroupId: entry.releaseGroupId,
                releaseIds: releaseIdChunk,
            });
            currentItemCount += releaseIdChunk.length;

            if (currentItemCount >= chunkSize) {
                flushCurrentChunk();
            }
        }
    }

    flushCurrentChunk();
    return chunks;
};

const submitArtistReleaseGroupCoversPage = (
    session: TaskSessionController<ReleaseGroupCoverTaskResult>,
    artistId: string,
    pageEntries: ReleaseGroupPageEntry[],
    ttl: number | undefined,
): void => {
    session.submitPage(
        async (signal) =>
            await fetchAndUpsertArtistReleaseGroupCovers(artistId, pageEntries, ttl, signal),
    );
};

const submitReleaseGroupReleaseCoversPage = (
    session: TaskSessionController<ReleaseGroupReleaseCoverTaskResult>,
    pageEntry: ReleaseGroupReleasesPageEntry,
    ttl: number | undefined,
): void => {
    const releaseGroupId = pageEntry.releaseGroupId;
    if (!releaseGroupId) {
        // Only the new-release feed carries group-less entries, and it goes through
        // `submitNewReleaseCoversPage`; the group release list always has an id.
        throw new Error('release group release covers require a release group id');
    }

    session.submitPage(
        async (signal) =>
            await fetchAndUpsertReleaseGroupReleaseCovers(
                releaseGroupId,
                pageEntry.releaseIds,
                ttl,
                signal,
            ),
    );
};

const submitNewReleaseCoversPage = (
    session: TaskSessionController<NewReleaseCoverTaskResult>,
    pageEntries: ReleaseGroupReleasesPageEntry[],
    ttl: number | undefined,
): void => {
    session.submitPage(
        async (signal) => await fetchAndUpsertNewReleaseGroupCovers(pageEntries, ttl, signal),
    );
};

const submitTrackLyricsPage = (
    session: TaskSessionController<TrackLyricsTaskResult>,
    releaseId: string,
    tracks: TrackLyricsRequest[],
    ttl: number | undefined,
): void => {
    session.submitPage(
        async (signal) => await fetchAndUpsertTrackLyrics(releaseId, tracks, ttl, signal),
    );
};

const submitArtistProfileImagesPage = (
    session: TaskSessionController<ArtistProfileImageTaskResult>,
    userId: string,
    artistLookups: ArtistProfileImageLookup[],
    ttl: number | undefined,
): void => {
    session.submitPage(
        async (signal) =>
            await fetchAndUpsertArtistProfileImages(userId, artistLookups, ttl, signal),
    );
};

export const queueArtistReleaseGroupCoversTask = (
    userId: string,
    artistId: string,
    pageEntries: ReleaseGroupPageEntry[],
    ttl: number | undefined,
    contractNamespace?: ContractNamespace,
): string => {
    return queueChunkedTask<ReleaseGroupCoverTaskResult, ReleaseGroupPageEntry[]>({
        userId,
        type: 'release_group_covers',
        dedupeKey: withTaskKeyNamespace(contractNamespace, `release_group_covers:${artistId}`),
        initialResult: {
            artistId,
            covers: {},
        },
        chunks: chunkArray(pageEntries, COVER_PAGE_CHUNK_SIZE),
        submitChunk: (session, chunk) => {
            submitArtistReleaseGroupCoversPage(session, artistId, chunk, ttl);
        },
    });
};

export const queueReleaseGroupReleaseCoversTask = (
    userId: string,
    releaseGroupId: string,
    pageEntries: ReleaseGroupReleasesPageEntry[],
    ttl: number | undefined,
    contractNamespace?: ContractNamespace,
): string => {
    return queueChunkedTask<ReleaseGroupReleaseCoverTaskResult, ReleaseGroupReleasesPageEntry[]>({
        userId,
        type: 'release_group_release_covers',
        dedupeKey: withTaskKeyNamespace(
            contractNamespace,
            `release_group_release_covers:${releaseGroupId}`,
        ),
        initialResult: {
            releaseGroupId,
            covers: {},
        },
        chunks: chunkReleaseGroupReleasePageEntries(pageEntries, COVER_PAGE_CHUNK_SIZE),
        submitChunk: (session, chunk) => {
            for (const pageEntry of chunk) {
                submitReleaseGroupReleaseCoversPage(session, pageEntry, ttl);
            }
        },
    });
};

export const queueNewReleaseCoversTask = (
    userId: string,
    dedupeKey: string,
    pageEntries: ReleaseGroupReleasesPageEntry[],
    ttl: number | undefined,
): string => {
    return queueChunkedTask<NewReleaseCoverTaskResult, ReleaseGroupReleasesPageEntry[]>({
        userId,
        type: 'new_release_covers',
        dedupeKey,
        initialResult: {
            covers: {},
        },
        chunks: chunkReleaseGroupReleasePageEntries(pageEntries, COVER_PAGE_CHUNK_SIZE),
        submitChunk: (session, chunk) => {
            submitNewReleaseCoversPage(session, chunk, ttl);
        },
    });
};

export const queueTrackLyricsTask = (
    userId: string,
    releaseId: string,
    tracks: TrackLyricsRequest[],
    ttl: number | undefined,
    contractNamespace?: ContractNamespace,
): string => {
    return queueChunkedTask<TrackLyricsTaskResult, TrackLyricsRequest[]>({
        userId,
        type: 'release_tracks_lyrics',
        dedupeKey: withTaskKeyNamespace(contractNamespace, `release_tracks_lyrics:${releaseId}`),
        initialResult: {
            releaseId,
            tracks: {},
        },
        chunks: chunkArray(tracks, SUBTASK_ITEM_LIMIT),
        submitChunk: (session, chunk) => {
            submitTrackLyricsPage(session, releaseId, chunk, ttl);
        },
    });
};

export const queueArtistProfileImagesTask = (
    userId: string,
    dedupeKey: string,
    artistLookups: ArtistProfileImageLookup[],
    ttl: number | undefined,
): string => {
    return queueChunkedTask<ArtistProfileImageTaskResult, ArtistProfileImageLookup[]>({
        userId,
        type: 'artist_profile_images',
        dedupeKey,
        initialResult: {
            artists: {},
        },
        chunks: chunkArray(artistLookups, SUBTASK_ITEM_LIMIT),
        submitChunk: (session, chunk) => {
            submitArtistProfileImagesPage(session, userId, chunk, ttl);
        },
    });
};

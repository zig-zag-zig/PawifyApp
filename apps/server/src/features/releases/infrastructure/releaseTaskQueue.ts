import { artistProfileImageTaskQueue } from '../../../infrastructure/taskQueues/profileImageTaskQueue.js';
import {
    queueArtistReleaseGroupCoversTask,
    queueNewReleaseCoversTask,
    queueReleaseGroupReleaseCoversTask,
    queueTrackLyricsTask,
    withTaskKeyNamespace,
} from '../../../services/backgroundTaskWorkers.js';
import { addTaskUser } from '../../../services/taskService.js';
import {
    collectReleaseArtistIds,
    collectTrackLyricsRequests,
    getNewReleaseCoverDedupeKey,
} from '../domain/releaseTaskPayloads.js';
import type { ReleaseTaskQueue } from '../ports.js';

export const releaseTaskQueue: ReleaseTaskQueue = {
    addTaskUser,
    queueArtistReleaseGroupCovers: (userId, artistId, pageEntries, ttl, options) => {
        return queueArtistReleaseGroupCoversTask(
            userId,
            artistId,
            pageEntries,
            ttl,
            options?.contractNamespace,
        );
    },
    queueReleaseGroupReleaseCovers: (userId, releaseGroupId, pageEntries, ttl, options) => {
        return queueReleaseGroupReleaseCoversTask(
            userId,
            releaseGroupId,
            pageEntries,
            ttl,
            options?.contractNamespace,
        );
    },
    queueNewReleaseCovers: (userId, pageEntries, ttl, options) => {
        const taskId = queueNewReleaseCoversTask(
            userId,
            withTaskKeyNamespace(
                options?.contractNamespace,
                getNewReleaseCoverDedupeKey(pageEntries),
            ),
            options?.pendingEntries ?? pageEntries,
            ttl,
        );
        addTaskUser(taskId, userId);
        return taskId;
    },
    queueReleaseTrackLyrics: (userId, release, ttl, options) => {
        const taskId = queueTrackLyricsTask(
            userId,
            release.id,
            options?.pendingTracks ?? collectTrackLyricsRequests(release),
            ttl,
            options?.contractNamespace,
        );
        addTaskUser(taskId, userId);
        return taskId;
    },
    queueReleaseArtistProfileImages: (userId, release, ttl, options) => {
        const fullArtistIds = options?.fullArtistIds ?? collectReleaseArtistIds(release);
        return artistProfileImageTaskQueue.queueArtistProfileImages(
            userId,
            `release:${release.id}`,
            options?.pendingArtistIds ?? fullArtistIds,
            ttl,
            {
                fullArtistIds,
                contractNamespace: options?.contractNamespace,
            },
        );
    },
};

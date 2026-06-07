import { useEffect, type Dispatch, type RefObject } from 'react';
import type { QueuedTask } from '../../../hooks/useTaskManager';
import type {
    ArtistDetailsResponse,
    ArtistReleasesResponse,
} from '../../../types/apiTypes';
import {
    describeError,
    describeIds,
    describeNullableStringMap,
    describeValueShape,
    diagnosticLog,
    diagnosticWarn,
    elapsedSince,
} from '../../../utils/diagnostics';
import { isTaskSettled } from '../domain/taskUtils';
import type { PendingTaskKey } from '../model/types';
import type { ArtistPageAction } from '../state/artistReducer';

type TaskResolution = { settled: boolean };
type TaskRecreateOptions = {
    recreateTask?: (expiredTaskId: string) => Promise<string | null | undefined>;
    recreateTaskDescription?: string;
    onPartialResolvedIds?: (ids: string[]) => void;
};

type ArtistPageDataTaskResultsOptions = {
    artistProfileImages: Record<string, string | null | undefined>;
    artistIdRef: RefObject<string | undefined>;
    artistTaskId: string | null;
    dispatch: Dispatch<ArtistPageAction>;
    getArtistDetails: (artistId: string) => Promise<ArtistDetailsResponse>;
    getArtistReleases: (artistId: string) => Promise<ArtistReleasesResponse>;
    releaseGroupCovers: Record<string, string | null | undefined>;
    releasesTaskId: string | null;
    removeTask: (taskId: string) => void;
    resolveArtistProfileImageTask: (
        profileImageTaskId: string | null | undefined,
        expectedArtistIds?: string[],
        recreateOptions?: TaskRecreateOptions,
    ) => Promise<TaskResolution>;
    resolveReleaseGroupCoverTask: (
        taskId: string | null | undefined,
        expectedReleaseGroupIds?: string[],
        recreateOptions?: TaskRecreateOptions,
    ) => Promise<TaskResolution>;
    resolvingSettledTaskIdsRef: RefObject<Set<string>>;
    taskStartedAtRef: RefObject<Record<string, number>>;
    tasks: QueuedTask[];
    updatePendingTask: (key: PendingTaskKey, taskId: string | null) => void;
};

function getIdsMissingFromCache(
    ids: string[],
    cache: Record<string, string | null | undefined>
): string[] {
    return ids.filter(id => cache[id] === undefined);
}

export function useArtistPageDataTaskResults({
    artistProfileImages,
    artistIdRef,
    artistTaskId,
    dispatch,
    getArtistDetails,
    getArtistReleases,
    releaseGroupCovers,
    releasesTaskId,
    removeTask,
    resolveArtistProfileImageTask,
    resolveReleaseGroupCoverTask,
    resolvingSettledTaskIdsRef,
    taskStartedAtRef,
    tasks,
    updatePendingTask,
}: ArtistPageDataTaskResultsOptions) {
    useEffect(() => {
        if (!artistTaskId) {
            return;
        }

        const task = tasks.find(item => item.id === artistTaskId) as QueuedTask<ArtistDetailsResponse> | undefined;
        if (!isTaskSettled(task)) {
            return;
        }
        if (resolvingSettledTaskIdsRef.current.has(artistTaskId)) {
            return;
        }
        resolvingSettledTaskIdsRef.current.add(artistTaskId);

        const handleTaskResult = async () => {
            diagnosticLog('artist-page', 'artist-details-task-settled', {
                currentArtistId: artistIdRef.current,
                taskId: artistTaskId,
                elapsedMs: elapsedSince(taskStartedAtRef.current[artistTaskId]),
                hasResult: task?.result !== undefined,
                hasError: task?.error !== undefined,
                resultShape: describeValueShape(task?.result),
            });
            delete taskStartedAtRef.current[artistTaskId];
            removeTask(artistTaskId);
            updatePendingTask('artistTaskId', null);

            if (task?.error) {
                console.error('artist-page: fetch artist details task failed', task.error);
                diagnosticWarn('artist-page', 'artist-details-task-error', {
                    currentArtistId: artistIdRef.current,
                    taskId: artistTaskId,
                    error: describeError(task.error),
                });
                dispatch({
                    type: 'artistLoadFailed',
                    message: 'Failed to load artist details',
                });
                return;
            }

            const artistData = task?.result?.artist;
            if (!artistData) {
                diagnosticWarn('artist-page', 'artist-details-task-empty-result', {
                    currentArtistId: artistIdRef.current,
                    taskId: artistTaskId,
                    resultShape: describeValueShape(task?.result),
                });
                dispatch({
                    type: 'artistLoadFailed',
                    message: 'Failed to load artist details',
                });
                return;
            }

            dispatch({
                type: 'artistLoadSucceeded',
                artist: artistData,
            });

            const artistImageTaskId = task.result?.profileImageTaskId;
            diagnosticLog('artist-page', 'artist-details-loaded', {
                currentArtistId: artistIdRef.current,
                loadedArtistId: artistData.id,
                profileImageTaskId: artistImageTaskId,
                artistShape: describeValueShape(artistData),
            });
            const pendingArtistImageIds = artistImageTaskId
                ? getIdsMissingFromCache([artistData.id], artistProfileImages)
                : [];
            diagnosticLog('artist-page', 'artist-profile-image-pending-calculated', {
                currentArtistId: artistIdRef.current,
                profileImageTaskId: artistImageTaskId,
                pendingArtistImageIds: describeIds(pendingArtistImageIds),
                cacheForArtist: describeNullableStringMap(artistProfileImages, [artistData.id]),
            });
            if (pendingArtistImageIds.length > 0) {
                dispatch({
                    type: 'artistImageLoadQueued',
                    artistIds: pendingArtistImageIds,
                });
            }

            const artistImageTaskResolution = await resolveArtistProfileImageTask(
                task.result?.profileImageTaskId,
                pendingArtistImageIds,
                {
                    recreateTask: async () => {
                        const result = await getArtistDetails(artistData.id);
                        return result.profileImageTaskId;
                    },
                    recreateTaskDescription: 'getArtistDetails.profileImageTaskId',
                    onPartialResolvedIds: artistIds => {
                        dispatch({
                            type: 'artistImageLoadFinished',
                            artistIds,
                        });
                    },
                }
            );
            if (pendingArtistImageIds.length > 0 && artistImageTaskResolution.settled) {
                dispatch({
                    type: 'artistImageLoadFinished',
                    artistIds: pendingArtistImageIds,
                });
            }

        };

        void handleTaskResult();
    }, [
        artistProfileImages,
        artistIdRef,
        artistTaskId,
        dispatch,
        getArtistDetails,
        removeTask,
        resolveArtistProfileImageTask,
        resolvingSettledTaskIdsRef,
        taskStartedAtRef,
        tasks,
        updatePendingTask,
    ]);

    useEffect(() => {
        if (!releasesTaskId) {
            return;
        }

        const task = tasks.find(item => item.id === releasesTaskId) as QueuedTask<ArtistReleasesResponse> | undefined;
        if (!isTaskSettled(task)) {
            return;
        }
        if (resolvingSettledTaskIdsRef.current.has(releasesTaskId)) {
            return;
        }
        resolvingSettledTaskIdsRef.current.add(releasesTaskId);

        const handleTaskResult = async () => {
            diagnosticLog('artist-page', 'artist-releases-task-settled', {
                currentArtistId: artistIdRef.current,
                taskId: releasesTaskId,
                elapsedMs: elapsedSince(taskStartedAtRef.current[releasesTaskId]),
                hasResult: task?.result !== undefined,
                hasError: task?.error !== undefined,
                resultShape: describeValueShape(task?.result),
            });
            delete taskStartedAtRef.current[releasesTaskId];
            removeTask(releasesTaskId);
            updatePendingTask('releasesTaskId', null);

            if (task?.error) {
                console.error('artist-page: fetch artist releases task failed', task.error);
                diagnosticWarn('artist-page', 'artist-releases-task-error', {
                    currentArtistId: artistIdRef.current,
                    taskId: releasesTaskId,
                    error: describeError(task.error),
                });
                dispatch({
                    type: 'releasesLoadFailed',
                    message: 'Failed to load artist releases',
                });
                return;
            }

            dispatch({
                type: 'releasesLoadSucceeded',
                releaseGroups: task?.result?.releaseGroups ?? [],
            });

            const releaseGroups = task?.result?.releaseGroups ?? [];
            const releaseGroupCoverTaskId = task?.result?.releaseGroupCoverTaskId;
            const pendingReleaseGroupCoverIds = releaseGroupCoverTaskId
                ? getIdsMissingFromCache(
                    releaseGroups.map(releaseGroup => releaseGroup.id),
                    releaseGroupCovers
                )
                : [];

            diagnosticLog('artist-page', 'artist-releases-loaded', {
                currentArtistId: artistIdRef.current,
                taskId: releasesTaskId,
                releaseGroupCount: releaseGroups.length,
                releaseGroupIds: describeIds(releaseGroups.map(releaseGroup => releaseGroup.id)),
                releaseGroupCoverTaskId,
                pendingReleaseGroupCoverIds: describeIds(pendingReleaseGroupCoverIds),
                releaseGroupCoverCache: describeNullableStringMap(
                    releaseGroupCovers,
                    releaseGroups.map(releaseGroup => releaseGroup.id)
                ),
            });

            if (pendingReleaseGroupCoverIds.length > 0) {
                dispatch({
                    type: 'releaseGroupCoverLoadQueued',
                    releaseGroupIds: pendingReleaseGroupCoverIds,
                });
            }

            const releaseGroupCoverTaskResolution = await resolveReleaseGroupCoverTask(
                releaseGroupCoverTaskId,
                pendingReleaseGroupCoverIds,
                {
                    recreateTask: async () => {
                        const currentArtistId = artistIdRef.current;
                        if (!currentArtistId) {
                            return null;
                        }

                        const result = await getArtistReleases(currentArtistId);
                        return result.releaseGroupCoverTaskId;
                    },
                    recreateTaskDescription: 'getArtistReleases.releaseGroupCoverTaskId',
                    onPartialResolvedIds: releaseGroupIds => {
                        dispatch({
                            type: 'releaseGroupCoverLoadFinished',
                            releaseGroupIds,
                        });
                    },
                }
            );
            if (pendingReleaseGroupCoverIds.length > 0 && releaseGroupCoverTaskResolution.settled) {
                dispatch({
                    type: 'releaseGroupCoverLoadFinished',
                    releaseGroupIds: pendingReleaseGroupCoverIds,
                });
            }
        };

        void handleTaskResult();
    }, [
        artistIdRef,
        dispatch,
        getArtistReleases,
        releaseGroupCovers,
        releasesTaskId,
        removeTask,
        resolveReleaseGroupCoverTask,
        resolvingSettledTaskIdsRef,
        taskStartedAtRef,
        tasks,
        updatePendingTask,
    ]);
}

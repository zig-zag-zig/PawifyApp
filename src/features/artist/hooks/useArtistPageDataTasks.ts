import { useCallback, useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { QueuedTask, TaskReplayPolicy } from '../../../hooks/useTaskManager';
import type {
    ArtistDetailsResponse,
    ArtistReleasesResponse
} from '../../../types/apiTypes';
import {
    describeError,
    diagnosticLog,
    diagnosticWarn,
} from '../../../utils/diagnostics';
import { getErrorMessage } from '../domain/taskUtils';
import type { PendingTaskKey } from '../model/types';
import type { ArtistPageAction } from '../state/artistReducer';
import { useArtistPageDataTaskResults } from './useArtistPageDataTaskResults';

type AddTaskOptions = {
    taskId?: string;
    origin?: string;
    replayPolicy?: TaskReplayPolicy;
};

type TaskResolution = { settled: boolean };
type TaskRecreateOptions = {
    recreateTask?: (expiredTaskId: string) => Promise<string | null | undefined>;
    recreateTaskDescription?: string;
};

type PendingTaskRef = RefObject<{
    artistTaskId: string | null;
    releasesTaskId: string | null;
}>;

type ArtistPageDataTasksOptions = {
    addTask: <T>(
        run: () => Promise<T>,
        operationName: string,
        options?: AddTaskOptions,
    ) => QueuedTask<T>;
    artistId: string | undefined;
    artistIdRef: RefObject<string | undefined>;
    artistProfileImages: Record<string, string | null | undefined>;
    dispatch: Dispatch<ArtistPageAction>;
    executeTask: <T>(task: QueuedTask<T>) => Promise<T | null>;
    getArtistDetails: (artistId: string) => Promise<ArtistDetailsResponse>;
    getArtistReleases: (artistId: string) => Promise<ArtistReleasesResponse>;
    pendingTaskRef: PendingTaskRef;
    queuedMemberImageIdsRef: RefObject<Set<string>>;
    releaseGroupCovers: Record<string, string | null | undefined>;
    releasesTaskId: string | null;
    artistTaskId: string | null;
    removeAllTasks: () => void;
    removeTask: (taskId: string) => void;
    resolvingMemberTaskIdsRef: RefObject<Set<string>>;
    resolvingSettledTaskIdsRef: RefObject<Set<string>>;
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
    mergeProfileImagesWithDiagnostics: (
        images: Record<string, string | null | undefined>,
        expectedArtistIds: string[],
        reason: string,
    ) => void;
    mergeReleaseGroupCoversWithDiagnostics: (
        covers: Record<string, string | null | undefined>,
        expectedReleaseGroupIds: string[],
        reason: string,
    ) => void;
    setOptimisticFollowing: Dispatch<SetStateAction<boolean | null>>;
    taskStartedAtRef: RefObject<Record<string, number>>;
    tasks: QueuedTask[];
    updatePendingTask: (key: PendingTaskKey, taskId: string | null) => void;
};

export function useArtistPageDataTasks({
    addTask,
    artistId,
    artistIdRef,
    artistProfileImages,
    dispatch,
    executeTask,
    getArtistDetails,
    getArtistReleases,
    pendingTaskRef,
    queuedMemberImageIdsRef,
    releaseGroupCovers,
    releasesTaskId,
    artistTaskId,
    removeAllTasks,
    removeTask,
    resolvingMemberTaskIdsRef,
    resolvingSettledTaskIdsRef,
    resolveArtistProfileImageTask,
    resolveReleaseGroupCoverTask,
    mergeProfileImagesWithDiagnostics,
    mergeReleaseGroupCoversWithDiagnostics,
    setOptimisticFollowing,
    taskStartedAtRef,
    tasks,
    updatePendingTask,
}: ArtistPageDataTasksOptions) {
    const loadArtistData = useCallback(() => {
        if (!artistId) {
            dispatch({
                type: 'artistLoadFailed',
                message: 'Could not find artist id.',
            });
            return;
        }

        diagnosticLog('artist-page', 'artist-load-start', {
            artistId,
        });
        dispatch({ type: 'artistLoadStarted' });

        if (pendingTaskRef.current.artistTaskId) {
            removeTask(pendingTaskRef.current.artistTaskId);
        }

        try {
            const artistTask = addTask(
                () => getArtistDetails(artistId),
                getArtistDetails.name,
                {
                    origin: 'artist-page:artist-details',
                    replayPolicy: 'both',
                }
            );

            taskStartedAtRef.current[artistTask.id] = Date.now();
            diagnosticLog('artist-page', 'artist-details-task-added', {
                artistId,
                taskId: artistTask.id,
            });
            updatePendingTask('artistTaskId', artistTask.id);
            void executeTask(artistTask);
        } catch (error) {
            diagnosticWarn('artist-page', 'artist-load-task-add-error', {
                artistId,
                error: describeError(error),
            });
            dispatch({
                type: 'artistLoadFailed',
                message: getErrorMessage(error, 'Failed to load artist data'),
            });
        }
    }, [addTask, artistId, dispatch, executeTask, getArtistDetails, pendingTaskRef, removeTask, taskStartedAtRef, updatePendingTask]);

    const loadReleasesData = useCallback(() => {
        if (!artistId) {
            dispatch({
                type: 'releasesLoadFailed',
                message: 'Could not find artist id.',
            });
            return;
        }

        diagnosticLog('artist-page', 'releases-load-start', {
            artistId,
        });
        dispatch({ type: 'releasesLoadStarted' });

        if (pendingTaskRef.current.releasesTaskId) {
            removeTask(pendingTaskRef.current.releasesTaskId);
        }

        try {
            const releasesTask = addTask(
                () => getArtistReleases(artistId),
                getArtistReleases.name,
                {
                    origin: 'artist-page:artist-releases',
                    replayPolicy: 'both',
                }
            );

            taskStartedAtRef.current[releasesTask.id] = Date.now();
            diagnosticLog('artist-page', 'artist-releases-task-added', {
                artistId,
                taskId: releasesTask.id,
            });
            updatePendingTask('releasesTaskId', releasesTask.id);
            void executeTask(releasesTask);
        } catch (error) {
            diagnosticWarn('artist-page', 'releases-load-task-add-error', {
                artistId,
                error: describeError(error),
            });
            dispatch({
                type: 'releasesLoadFailed',
                message: getErrorMessage(error, 'Failed to load artist releases'),
            });
        }
    }, [addTask, artistId, dispatch, executeTask, getArtistReleases, pendingTaskRef, removeTask, taskStartedAtRef, updatePendingTask]);

    useEffect(() => {
        diagnosticLog('artist-page', 'screen-reset', {
            previousArtistId: artistIdRef.current,
            nextArtistId: artistId,
        });
        removeAllTasks();
        setOptimisticFollowing(null);
        dispatch({ type: 'resetForArtistChange' });
        pendingTaskRef.current = {
            artistTaskId: null,
            releasesTaskId: null,
        };
        artistIdRef.current = artistId;
        queuedMemberImageIdsRef.current.clear();
        resolvingMemberTaskIdsRef.current.clear();
        resolvingSettledTaskIdsRef.current.clear();
        taskStartedAtRef.current = {};
    }, [
        artistId,
        artistIdRef,
        dispatch,
        pendingTaskRef,
        queuedMemberImageIdsRef,
        removeAllTasks,
        resolvingMemberTaskIdsRef,
        resolvingSettledTaskIdsRef,
        setOptimisticFollowing,
        taskStartedAtRef,
    ]);

    useEffect(() => {
        loadArtistData();
        loadReleasesData();
    }, [loadArtistData, loadReleasesData]);

    useEffect(() => {
        return () => {
            removeAllTasks();
        };
    }, [removeAllTasks]);

    useArtistPageDataTaskResults({
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
        mergeProfileImagesWithDiagnostics,
        mergeReleaseGroupCoversWithDiagnostics,
        resolvingSettledTaskIdsRef,
        taskStartedAtRef,
        tasks,
        updatePendingTask,
    });

    return {
        loadArtistData,
        loadReleasesData,
    };
}

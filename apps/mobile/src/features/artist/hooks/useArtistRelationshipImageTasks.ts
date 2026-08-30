import { useCallback, useEffect, type Dispatch, type RefObject } from 'react';
import { scheduleIdleCallback } from '../../../utils/scheduleIdle';
import type { QueuedTask, TaskReplayPolicy } from '../../../hooks/useTaskManager';
import type { ArtistDetailsResponse } from '../../../types/apiTypes';
import {
    describeError,
    describeIds,
    describeValueShape,
    diagnosticLog,
    diagnosticWarn,
    elapsedSince,
} from '../../../utils/diagnostics';
import { isTaskSettled } from '../domain/taskUtils';
import { normalizeNullableStringMap } from '../../../utils/nullableMaps';
import type { ArtistPageAction } from '../state/artistReducer';

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

type ArtistRelationshipImageTasksOptions = {
    addTask: <T>(
        run: () => Promise<T>,
        operationName: string,
        options?: AddTaskOptions,
    ) => QueuedTask<T>;
    artistIdRef: RefObject<string | undefined>;
    artistProfileImagesRef: RefObject<Record<string, string | null | undefined>>;
    dispatch: Dispatch<ArtistPageAction>;
    executeTask: <T>(task: QueuedTask<T>) => Promise<T | null>;
    getArtistDetails: (artistId: string) => Promise<ArtistDetailsResponse>;
    isMountedRef: RefObject<boolean>;
    membersWithoutCachedPicture: string[];
    queuedMemberImageIdsRef: RefObject<Set<string>>;
    removeTask: (taskId: string) => void;
    resolvingMemberTaskIdsRef: RefObject<Set<string>>;
    resolveArtistProfileImageTask: (
        profileImageTaskId: string | null | undefined,
        expectedArtistIds?: string[],
        recreateOptions?: TaskRecreateOptions,
    ) => Promise<TaskResolution>;
    mergeProfileImagesWithDiagnostics: (
        images: Record<string, string | null | undefined>,
        expectedArtistIds: string[],
        reason: string,
    ) => void;
    taskStartedAtRef: RefObject<Record<string, number>>;
    tasks: QueuedTask[];
};

export function useArtistRelationshipImageTasks({
    addTask,
    artistIdRef,
    artistProfileImagesRef,
    dispatch,
    executeTask,
    getArtistDetails,
    isMountedRef,
    membersWithoutCachedPicture,
    queuedMemberImageIdsRef,
    removeTask,
    resolvingMemberTaskIdsRef,
    resolveArtistProfileImageTask,
    mergeProfileImagesWithDiagnostics,
    taskStartedAtRef,
    tasks,
}: ArtistRelationshipImageTasksOptions) {
    useEffect(() => {
        if (membersWithoutCachedPicture.length === 0 || tasks.length === 0) {
            return;
        }

        const resolveMemberTasks = async () => {
            const memberIds = new Set(membersWithoutCachedPicture);
            const memberTasks = tasks.filter(task =>
                memberIds.has(task.id) &&
                isTaskSettled(task) &&
                !resolvingMemberTaskIdsRef.current.has(task.id)
            );
            if (memberTasks.length === 0) {
                return;
            }

            memberTasks.forEach(memberTask => {
                resolvingMemberTaskIdsRef.current.add(memberTask.id);
            });

            diagnosticLog('artist-page', 'member-image-tasks-settled', {
                currentArtistId: artistIdRef.current,
                waitingMemberIds: describeIds(membersWithoutCachedPicture),
                settledMemberTaskIds: describeIds(memberTasks.map(task => task.id)),
                totalTasks: tasks.length,
            });

            for (const memberTask of memberTasks) {
                diagnosticLog('artist-page', 'member-details-task-settled', {
                    currentArtistId: artistIdRef.current,
                    memberId: memberTask.id,
                    elapsedMs: elapsedSince(taskStartedAtRef.current[memberTask.id]),
                    hasResult: memberTask.result !== undefined,
                    hasError: memberTask.error !== undefined,
                    resultShape: describeValueShape(memberTask.result),
                });
                delete taskStartedAtRef.current[memberTask.id];

                if (memberTask.error) {
                    console.error('artist-page: fetch member details task failed', {
                        memberId: memberTask.id,
                        error: memberTask.error,
                    });
                    diagnosticWarn('artist-page', 'member-details-task-error', {
                        currentArtistId: artistIdRef.current,
                        memberId: memberTask.id,
                        error: describeError(memberTask.error),
                    });
                    queuedMemberImageIdsRef.current.delete(memberTask.id);
                    removeTask(memberTask.id);
                    dispatch({
                        type: 'artistImageLoadFinished',
                        artistIds: [memberTask.id],
                    });
                    dispatch({ type: 'memberPictureResolved', memberId: memberTask.id });
                    continue;
                }

                const memberResult = memberTask.result as ArtistDetailsResponse | undefined;
                diagnosticLog('artist-page', 'member-details-loaded', {
                    currentArtistId: artistIdRef.current,
                    memberId: memberTask.id,
                    profileImageTaskId: memberResult?.profileImageTaskId,
                    artistIdFromResult: memberResult?.artist?.id,
                    resultShape: describeValueShape(memberResult),
                });
                const immediateMemberImages = normalizeNullableStringMap(memberResult?.profileImages);
                if (Object.keys(immediateMemberImages).length > 0) {
                    mergeProfileImagesWithDiagnostics(
                        immediateMemberImages,
                        [memberTask.id],
                        'member-details-immediate'
                    );
                }
                const memberImageTaskId = typeof memberResult?.profileImageTaskId === 'string'
                    ? memberResult.profileImageTaskId
                    : null;
                const memberTaskResolution = await resolveArtistProfileImageTask(
                    memberImageTaskId,
                    immediateMemberImages[memberTask.id] === undefined ? [memberTask.id] : [],
                    {
                        recreateTask: async () => {
                            const result = await getArtistDetails(memberTask.id);
                            mergeProfileImagesWithDiagnostics(
                                normalizeNullableStringMap(result.profileImages),
                                [memberTask.id],
                                'member-details-replay'
                            );
                            return result.profileImageTaskId;
                        },
                        recreateTaskDescription: 'getArtistDetails.profileImageTaskId',
                    }
                );
                if (memberTaskResolution.settled) {
                    queuedMemberImageIdsRef.current.delete(memberTask.id);
                    removeTask(memberTask.id);
                    dispatch({
                        type: 'artistImageLoadFinished',
                        artistIds: [memberTask.id],
                    });
                    dispatch({ type: 'memberPictureResolved', memberId: memberTask.id });
                }
            }
        };

        void resolveMemberTasks();
    }, [
        artistIdRef,
        dispatch,
        getArtistDetails,
        membersWithoutCachedPicture,
        queuedMemberImageIdsRef,
        removeTask,
        resolvingMemberTaskIdsRef,
        resolveArtistProfileImageTask,
        taskStartedAtRef,
        tasks,
    ]);

    const handleRelationshipsExpanded = useCallback((relationshipArtistIds: string[]) => {
        const artistIdAtQueueTime = artistIdRef.current;
        const uniqueRelationshipArtistIds = [...new Set(relationshipArtistIds)];
        const cachedArtistIds = uniqueRelationshipArtistIds.filter(memberId =>
            artistProfileImagesRef.current[memberId] !== undefined
        );
        const alreadyQueuedArtistIds = uniqueRelationshipArtistIds.filter(memberId =>
            queuedMemberImageIdsRef.current.has(memberId)
        );
        const missingArtistIds = uniqueRelationshipArtistIds.filter(memberId =>
            artistProfileImagesRef.current[memberId] === undefined &&
            !queuedMemberImageIdsRef.current.has(memberId)
        );

        diagnosticLog('artist-page', 'relationships-expanded', {
            currentArtistId: artistIdAtQueueTime,
            relationshipArtistIds: describeIds(uniqueRelationshipArtistIds),
            cachedArtistIds: describeIds(cachedArtistIds),
            alreadyQueuedArtistIds: describeIds(alreadyQueuedArtistIds),
            missingArtistIds: describeIds(missingArtistIds),
        });

        if (missingArtistIds.length === 0) {
            return;
        }

        const interactionWaitStartedAt = Date.now();
        scheduleIdleCallback(() => {
            if (!isMountedRef.current || artistIdRef.current !== artistIdAtQueueTime) {
                diagnosticWarn('artist-page', 'member-image-queue-cancelled', {
                    artistIdAtQueueTime,
                    currentArtistId: artistIdRef.current,
                    isMounted: isMountedRef.current,
                    missingArtistIds: describeIds(missingArtistIds),
                    interactionWaitMs: elapsedSince(interactionWaitStartedAt),
                });
                return;
            }

            const queuedNowIds: string[] = [];
            const skippedNowIds: string[] = [];
            diagnosticLog('artist-page', 'relationships-after-interactions', {
                currentArtistId: artistIdAtQueueTime,
                missingArtistIds: describeIds(missingArtistIds),
                interactionWaitMs: elapsedSince(interactionWaitStartedAt),
            });

            missingArtistIds.forEach(memberId => {
                if (
                    artistProfileImagesRef.current[memberId] !== undefined ||
                    queuedMemberImageIdsRef.current.has(memberId)
                ) {
                    skippedNowIds.push(memberId);
                    return;
                }

                queuedMemberImageIdsRef.current.add(memberId);
                dispatch({ type: 'memberPictureQueued', memberId });
                dispatch({
                    type: 'artistImageLoadQueued',
                    artistIds: [memberId],
                });

                try {
                    const memberTask = addTask(
                        () => getArtistDetails(memberId),
                        getArtistDetails.name,
                        {
                            taskId: memberId,
                            origin: 'artist-page:member-image',
                            replayPolicy: 'both',
                        }
                    );

                    taskStartedAtRef.current[memberTask.id] = Date.now();
                    queuedNowIds.push(memberId);
                    void executeTask(memberTask);
                } catch (error) {
                    queuedMemberImageIdsRef.current.delete(memberId);
                    dispatch({
                        type: 'artistImageLoadFinished',
                        artistIds: [memberId],
                    });
                    dispatch({ type: 'memberPictureResolved', memberId });
                    diagnosticWarn('artist-page', 'member-image-task-add-error', {
                        currentArtistId: artistIdAtQueueTime,
                        memberId,
                        error: describeError(error),
                    });
                    console.error('artist-page: queue member image task failed', error);
                }
            });

            diagnosticLog('artist-page', 'member-image-queue-batch-finished', {
                currentArtistId: artistIdAtQueueTime,
                queuedNowIds: describeIds(queuedNowIds),
                skippedNowIds: describeIds(skippedNowIds),
                queuedTotal: queuedMemberImageIdsRef.current.size,
            });
        });
    }, [
        addTask,
        artistIdRef,
        artistProfileImagesRef,
        dispatch,
        executeTask,
        getArtistDetails,
        isMountedRef,
        queuedMemberImageIdsRef,
        taskStartedAtRef,
    ]);

    return {
        handleRelationshipsExpanded,
    };
}

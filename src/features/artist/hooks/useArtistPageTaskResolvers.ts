import { useCallback, type RefObject } from 'react';
import { extractArtistProfileImages, extractReleaseGroupCovers } from '../../../utils/taskResultMaps';
import { fillMissingIdsWithNull } from '../../../utils/nullableMaps';
import type { TaskResultResponse } from '../../../types/apiTypes';
import type { WaitForTaskResultOptions } from '../../../services/taskResultWaiter';
import {
    describeError,
    describeIds,
    describeNullableStringMap,
    describeValueShape,
    diagnosticLog,
    diagnosticWarn,
    elapsedSince,
} from '../../../utils/diagnostics';

type TaskResolution = { settled: boolean };
type TaskRecreateOptions = Pick<WaitForTaskResultOptions, 'recreateTask' | 'recreateTaskDescription'> & {
    onPartialResolvedIds?: (ids: string[]) => void;
};

type ArtistPageTaskResolversOptions = {
    artistIdRef: RefObject<string | undefined>;
    waitForTaskResult: <T>(
        taskId: string,
        options?: WaitForTaskResultOptions,
    ) => Promise<TaskResultResponse<T>>;
    mergeProfileImagesWithDiagnostics: (
        images: Record<string, string | null | undefined>,
        expectedArtistIds: string[],
        source: string,
    ) => void;
    mergeReleaseGroupCoversWithDiagnostics: (
        covers: Record<string, string | null | undefined>,
        expectedReleaseGroupIds: string[],
        source: string,
    ) => void;
};

const ARTIST_PAGE_TASK_NOTIFICATION_WAIT_MS = 2500;
const ARTIST_PAGE_TASK_POLL_INTERVAL_MS = 5000;

export function useArtistPageTaskResolvers({
    artistIdRef,
    waitForTaskResult,
    mergeProfileImagesWithDiagnostics,
    mergeReleaseGroupCoversWithDiagnostics,
}: ArtistPageTaskResolversOptions) {
    const resolveArtistProfileImageTask = useCallback(async (
        profileImageTaskId: string | null | undefined,
        expectedArtistIds: string[] = [],
        recreateOptions?: TaskRecreateOptions
    ): Promise<TaskResolution> => {
        if (!profileImageTaskId) {
            if (expectedArtistIds.length > 0) {
                diagnosticWarn('artist-page', 'profile-image-task-missing', {
                    currentArtistId: artistIdRef.current,
                    expectedArtistIds: describeIds(expectedArtistIds),
                });
            }
            if (expectedArtistIds.length > 0) {
                mergeProfileImagesWithDiagnostics(
                    fillMissingIdsWithNull(expectedArtistIds, {}),
                    expectedArtistIds,
                    'missing-profile-image-task-id'
                );
            }
            return { settled: true };
        }

        const waitStartedAt = Date.now();
        diagnosticLog('artist-page', 'profile-image-task-wait-start', {
            currentArtistId: artistIdRef.current,
            profileImageTaskId,
            expectedArtistIds: describeIds(expectedArtistIds),
        });

        try {
            const taskResult = await waitForTaskResult(profileImageTaskId, {
                notificationWaitMs: ARTIST_PAGE_TASK_NOTIFICATION_WAIT_MS,
                pollIntervalMs: ARTIST_PAGE_TASK_POLL_INTERVAL_MS,
                onPartialResult: partialResult => {
                    const images = extractArtistProfileImages(partialResult.result);
                    const resolvedArtistIds = expectedArtistIds.filter(id => images[id] !== undefined);
                    if (resolvedArtistIds.length === 0) {
                        return;
                    }

                    diagnosticLog('artist-page', 'profile-image-task-partial', {
                        currentArtistId: artistIdRef.current,
                        profileImageTaskId,
                        resolvedArtistIds: describeIds(resolvedArtistIds),
                        extracted: describeNullableStringMap(images, expectedArtistIds),
                    });
                    mergeProfileImagesWithDiagnostics(
                        images,
                        expectedArtistIds,
                        'profile-image-task-partial'
                    );
                    recreateOptions?.onPartialResolvedIds?.(resolvedArtistIds);
                },
                recreateTask: recreateOptions?.recreateTask,
                recreateTaskDescription: recreateOptions?.recreateTaskDescription,
            });
            const status = taskResult.status.toLowerCase();
            diagnosticLog('artist-page', 'profile-image-task-result', {
                currentArtistId: artistIdRef.current,
                profileImageTaskId,
                status: taskResult.status,
                type: taskResult.type,
                waitMs: elapsedSince(waitStartedAt),
                expectedArtistIds: describeIds(expectedArtistIds),
                resultShape: describeValueShape(taskResult.result),
                errorShape: taskResult.error !== undefined ? describeValueShape(taskResult.error) : undefined,
            });
            if (status !== 'completed') {
                const completedArtistImages = fillMissingIdsWithNull(expectedArtistIds, {});
                diagnosticWarn('artist-page', 'profile-image-task-not-completed', {
                    currentArtistId: artistIdRef.current,
                    profileImageTaskId,
                    status: taskResult.status,
                    expectedArtistIds: describeIds(expectedArtistIds),
                });
                mergeProfileImagesWithDiagnostics(
                    completedArtistImages,
                    expectedArtistIds,
                    `profile-image-task-${status}`
                );
                return { settled: true };
            }

            const images = extractArtistProfileImages(taskResult.result);
            const completedArtistImages = fillMissingIdsWithNull(expectedArtistIds, images);
            const unresolvedArtistIds = expectedArtistIds.filter(id => completedArtistImages[id] === null);
            const resolvedArtistIds = expectedArtistIds.filter(id => typeof completedArtistImages[id] === 'string');
            const missingFromPayloadIds = expectedArtistIds.filter(id => images[id] === undefined);

            diagnosticLog('artist-page', 'profile-image-task-extracted', {
                currentArtistId: artistIdRef.current,
                profileImageTaskId,
                waitMs: elapsedSince(waitStartedAt),
                expectedArtistIds: describeIds(expectedArtistIds),
                extracted: describeNullableStringMap(images, expectedArtistIds),
                completed: describeNullableStringMap(completedArtistImages, expectedArtistIds),
                resolvedCount: resolvedArtistIds.length,
                unresolvedCount: unresolvedArtistIds.length,
                missingFromPayloadCount: missingFromPayloadIds.length,
            });

            mergeProfileImagesWithDiagnostics(
                completedArtistImages,
                expectedArtistIds,
                'profile-image-task-completed'
            );

            return { settled: true };
        } catch (error) {
            console.error('artist-page: resolve profile image task failed', error);
            diagnosticWarn('artist-page', 'profile-image-task-error', {
                currentArtistId: artistIdRef.current,
                profileImageTaskId,
                waitMs: elapsedSince(waitStartedAt),
                expectedArtistIds: describeIds(expectedArtistIds),
                error: describeError(error),
            });
            if (expectedArtistIds.length > 0) {
                mergeProfileImagesWithDiagnostics(
                    fillMissingIdsWithNull(expectedArtistIds, {}),
                    expectedArtistIds,
                    'profile-image-task-error'
                );
            }
            return { settled: true };
        }
    }, [artistIdRef, mergeProfileImagesWithDiagnostics, waitForTaskResult]);

    const resolveReleaseGroupCoverTask = useCallback(async (
        taskId: string | null | undefined,
        expectedReleaseGroupIds: string[] = [],
        recreateOptions?: TaskRecreateOptions
    ): Promise<TaskResolution> => {
        if (!taskId) {
            if (expectedReleaseGroupIds.length > 0) {
                diagnosticWarn('artist-page', 'release-group-cover-task-missing', {
                    currentArtistId: artistIdRef.current,
                    expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                });
            }
            return { settled: true };
        }

        const waitStartedAt = Date.now();
        diagnosticLog('artist-page', 'release-group-cover-task-wait-start', {
            currentArtistId: artistIdRef.current,
            taskId,
            expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
        });

        try {
            const taskResult = await waitForTaskResult(taskId, {
                notificationWaitMs: ARTIST_PAGE_TASK_NOTIFICATION_WAIT_MS,
                pollIntervalMs: ARTIST_PAGE_TASK_POLL_INTERVAL_MS,
                onPartialResult: partialResult => {
                    const covers = extractReleaseGroupCovers(partialResult.result);
                    const resolvedReleaseGroupIds = expectedReleaseGroupIds.filter(id => covers[id] !== undefined);
                    if (resolvedReleaseGroupIds.length === 0) {
                        return;
                    }

                    diagnosticLog('artist-page', 'release-group-cover-task-partial', {
                        currentArtistId: artistIdRef.current,
                        taskId,
                        resolvedReleaseGroupIds: describeIds(resolvedReleaseGroupIds),
                        extracted: describeNullableStringMap(covers, expectedReleaseGroupIds),
                    });
                    mergeReleaseGroupCoversWithDiagnostics(
                        covers,
                        expectedReleaseGroupIds,
                        'release-group-cover-task-partial'
                    );
                    recreateOptions?.onPartialResolvedIds?.(resolvedReleaseGroupIds);
                },
                recreateTask: recreateOptions?.recreateTask,
                recreateTaskDescription: recreateOptions?.recreateTaskDescription,
            });
            const status = taskResult.status.toLowerCase();
            diagnosticLog('artist-page', 'release-group-cover-task-result', {
                currentArtistId: artistIdRef.current,
                taskId,
                status: taskResult.status,
                type: taskResult.type,
                waitMs: elapsedSince(waitStartedAt),
                expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                resultShape: describeValueShape(taskResult.result),
                errorShape: taskResult.error !== undefined ? describeValueShape(taskResult.error) : undefined,
            });
            if (status !== 'completed') {
                diagnosticWarn('artist-page', 'release-group-cover-task-not-completed', {
                    currentArtistId: artistIdRef.current,
                    taskId,
                    status: taskResult.status,
                    expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                });
                return { settled: true };
            }

            const covers = extractReleaseGroupCovers(taskResult.result);
            if (Object.keys(covers).length === 0) {
                diagnosticWarn('artist-page', 'release-group-cover-task-empty', {
                    currentArtistId: artistIdRef.current,
                    taskId,
                    waitMs: elapsedSince(waitStartedAt),
                    expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                });
                return { settled: true };
            }

            diagnosticLog('artist-page', 'release-group-cover-task-extracted', {
                currentArtistId: artistIdRef.current,
                taskId,
                waitMs: elapsedSince(waitStartedAt),
                expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                extracted: describeNullableStringMap(covers, expectedReleaseGroupIds),
            });

            mergeReleaseGroupCoversWithDiagnostics(
                covers,
                expectedReleaseGroupIds,
                'release-group-cover-task-completed'
            );

            return { settled: true };
        } catch (error) {
            console.error('artist-page: resolve release-group cover task failed', error);
            diagnosticWarn('artist-page', 'release-group-cover-task-error', {
                currentArtistId: artistIdRef.current,
                taskId,
                waitMs: elapsedSince(waitStartedAt),
                expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                error: describeError(error),
            });
            return { settled: true };
        }
    }, [artistIdRef, mergeReleaseGroupCoversWithDiagnostics, waitForTaskResult]);

    return {
        resolveArtistProfileImageTask,
        resolveReleaseGroupCoverTask,
    };
}

import { useCallback, type RefObject } from 'react';
import { resolveNullableTaskMap, type ResolveNullableTaskMapPhase } from '../../../shared/taskResults/resolveNullableTaskMap';
import { extractArtistProfileImages, extractReleaseGroupCovers } from '../../../utils/taskResultMaps';
import type { TaskResultResponse } from '../../../types/apiTypes';
import type { WaitForTaskResultOptions } from '../../../services/taskResultWaiter';
import {
    describeError,
    describeIds,
    describeNullableStringMap,
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

function getTaskSource(prefix: string, phase: ResolveNullableTaskMapPhase): string {
    switch (phase) {
        case 'partial':
            return `${prefix}-partial`;
        case 'completed':
            return `${prefix}-completed`;
        case 'non-completed':
            return `${prefix}-not-completed`;
        case 'error':
            return `${prefix}-error`;
        case 'missing-task':
        default:
            return `${prefix}-missing`;
    }
}

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
            // Full migration: a null task id means the backend resolved every
            // requested id via the immediate map; nothing is pending. Do not
            // null-fill expected ids (they are already resolved or absent).
            if (expectedArtistIds.length > 0) {
                diagnosticWarn('artist-page', 'profile-image-task-missing', {
                    currentArtistId: artistIdRef.current,
                    expectedArtistIds: describeIds(expectedArtistIds),
                });
            }
            return { settled: true };
        }

        const waitStartedAt = Date.now();
        diagnosticLog('artist-page', 'profile-image-task-wait-start', {
            currentArtistId: artistIdRef.current,
            profileImageTaskId,
            expectedArtistIds: describeIds(expectedArtistIds),
        });

        await resolveNullableTaskMap({
            taskId: profileImageTaskId,
            expectedIds: expectedArtistIds,
            waitForTaskResult,
            extractMap: extractArtistProfileImages,
            waitOptions: {
                notificationWaitMs: ARTIST_PAGE_TASK_NOTIFICATION_WAIT_MS,
                pollIntervalMs: ARTIST_PAGE_TASK_POLL_INTERVAL_MS,
            },
            onResolvedValues: (images, resolvedArtistIds, phase) => {
                diagnosticLog('artist-page', `profile-image-task-${phase}`, {
                    currentArtistId: artistIdRef.current,
                    profileImageTaskId,
                    waitMs: elapsedSince(waitStartedAt),
                    expectedArtistIds: describeIds(expectedArtistIds),
                    resolvedArtistIds: describeIds(resolvedArtistIds),
                    extracted: describeNullableStringMap(images, expectedArtistIds),
                });
                mergeProfileImagesWithDiagnostics(
                    images,
                    expectedArtistIds,
                    getTaskSource('profile-image-task', phase)
                );
                if (phase === 'partial') {
                    recreateOptions?.onPartialResolvedIds?.(resolvedArtistIds);
                }
            },
            onError: error => {
                console.error('artist-page: resolve profile image task failed', error);
                diagnosticWarn('artist-page', 'profile-image-task-error', {
                    currentArtistId: artistIdRef.current,
                    profileImageTaskId,
                    waitMs: elapsedSince(waitStartedAt),
                    expectedArtistIds: describeIds(expectedArtistIds),
                    error: describeError(error),
                });
            },
            recreateTask: recreateOptions?.recreateTask,
            recreateTaskDescription: recreateOptions?.recreateTaskDescription,
        });

        return { settled: true };
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

        await resolveNullableTaskMap({
            taskId,
            expectedIds: expectedReleaseGroupIds,
            waitForTaskResult,
            extractMap: extractReleaseGroupCovers,
            waitOptions: {
                notificationWaitMs: ARTIST_PAGE_TASK_NOTIFICATION_WAIT_MS,
                pollIntervalMs: ARTIST_PAGE_TASK_POLL_INTERVAL_MS,
            },
            onResolvedValues: (covers, resolvedReleaseGroupIds, phase) => {
                diagnosticLog('artist-page', `release-group-cover-task-${phase}`, {
                    currentArtistId: artistIdRef.current,
                    taskId,
                    waitMs: elapsedSince(waitStartedAt),
                    expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                    resolvedReleaseGroupIds: describeIds(resolvedReleaseGroupIds),
                    extracted: describeNullableStringMap(covers, expectedReleaseGroupIds),
                });
                if (Object.keys(covers).length > 0) {
                    mergeReleaseGroupCoversWithDiagnostics(
                        covers,
                        expectedReleaseGroupIds,
                        getTaskSource('release-group-cover-task', phase)
                    );
                }
                if (phase === 'partial') {
                    recreateOptions?.onPartialResolvedIds?.(resolvedReleaseGroupIds);
                }
            },
            onError: error => {
                console.error('artist-page: resolve release-group cover task failed', error);
                diagnosticWarn('artist-page', 'release-group-cover-task-error', {
                    currentArtistId: artistIdRef.current,
                    taskId,
                    waitMs: elapsedSince(waitStartedAt),
                    expectedReleaseGroupIds: describeIds(expectedReleaseGroupIds),
                    error: describeError(error),
                });
            },
            shouldFillMissingOnCompleted: () => false,
            shouldFillMissingOnError: false,
            shouldFillMissingOnNonCompleted: false,
            recreateTask: recreateOptions?.recreateTask,
            recreateTaskDescription: recreateOptions?.recreateTaskDescription,
        });

        return { settled: true };
    }, [artistIdRef, mergeReleaseGroupCoversWithDiagnostics, waitForTaskResult]);

    return {
        resolveArtistProfileImageTask,
        resolveReleaseGroupCoverTask,
    };
}

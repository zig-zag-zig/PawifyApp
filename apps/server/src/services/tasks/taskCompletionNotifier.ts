import { createLogger } from '../../common/logging/logger.js';
import type { RequestLogContext } from '../../common/logging/requestContext.js';
import { backgroundTaskConfig } from '../../config/runtimeConfig.js';
import type { BackgroundTaskType } from '../../utils/types/taskTypes.js';
import { sendDataOnlyNotification } from '../notifications/dataNotificationPublisher.js';
import { notificationEvents } from '../notifications/notificationEvents.js';
import { withTaskContext } from './taskContext.js';

const logger = createLogger('services.tasks.notifications');
const PROGRESS_NOTIFICATION_THROTTLE_MS = backgroundTaskConfig.progressNotificationThrottleMs;

type TaskCompletionNotificationStatus = 'completed' | 'failed' | 'progress';

type ProgressNotificationRequest = {
    userIds: string[];
    taskId: string;
    taskType: BackgroundTaskType;
    context?: RequestLogContext;
    payload?: Record<string, unknown>;
};

type ProgressNotificationState = {
    lastSentAt: number;
    pendingTimer?: ReturnType<typeof setTimeout>;
    pendingRequest?: ProgressNotificationRequest;
};

const sendTaskCompletedNotificationNow = async (
    userIds: string[],
    taskId: string,
    taskType: BackgroundTaskType,
    status: TaskCompletionNotificationStatus,
    context?: RequestLogContext,
    payload?: Record<string, unknown>,
): Promise<void> => {
    await withTaskContext(context, async () => {
        const startedAt = Date.now();
        let failureCount = 0;

        logger.debug('task completion notification started', {
            taskId,
            taskType,
            status,
            userCount: userIds.length,
        });

        await Promise.all(
            userIds.map(async (userId) => {
                try {
                    await sendDataOnlyNotification(userId, notificationEvents.taskCompleted, {
                        taskId,
                        taskType,
                        status,
                        ...payload,
                    });
                } catch (error) {
                    failureCount += 1;
                    logger.error('task completion notification failed', {
                        taskId,
                        taskType,
                        userId,
                        status,
                        error,
                    });
                }
            }),
        );

        logger.debug('task completion notification completed', {
            taskId,
            taskType,
            status,
            userCount: userIds.length,
            failureCount,
            durationMs: Date.now() - startedAt,
        });
    });
};

const progressNotificationStateByTaskId = new Map<string, ProgressNotificationState>();

const clearPendingProgressNotification = (taskId: string): void => {
    const state = progressNotificationStateByTaskId.get(taskId);
    if (state?.pendingTimer) {
        clearTimeout(state.pendingTimer);
    }
    progressNotificationStateByTaskId.delete(taskId);
};

const sendPendingProgressNotification = (taskId: string): void => {
    const state = progressNotificationStateByTaskId.get(taskId);
    const request = state?.pendingRequest;
    if (!state || !request) {
        return;
    }

    state.pendingTimer = undefined;
    state.pendingRequest = undefined;
    state.lastSentAt = Date.now();

    void sendTaskCompletedNotificationNow(
        request.userIds,
        request.taskId,
        request.taskType,
        'progress',
        request.context,
        request.payload,
    );
};

const scheduleProgressNotification = (
    taskId: string,
    state: ProgressNotificationState,
    delayMs: number,
): void => {
    state.pendingTimer = setTimeout(() => {
        sendPendingProgressNotification(taskId);
    }, delayMs);
    state.pendingTimer.unref?.();
};

const sendThrottledProgressNotification = async (
    userIds: string[],
    taskId: string,
    taskType: BackgroundTaskType,
    context?: RequestLogContext,
    payload?: Record<string, unknown>,
): Promise<void> => {
    const now = Date.now();
    const existingState = progressNotificationStateByTaskId.get(taskId);

    if (!existingState) {
        progressNotificationStateByTaskId.set(taskId, { lastSentAt: now });
        await sendTaskCompletedNotificationNow(
            userIds,
            taskId,
            taskType,
            'progress',
            context,
            payload,
        );
        return;
    }

    const elapsedMs = now - existingState.lastSentAt;
    if (elapsedMs >= PROGRESS_NOTIFICATION_THROTTLE_MS) {
        if (existingState.pendingTimer) {
            clearTimeout(existingState.pendingTimer);
            existingState.pendingTimer = undefined;
            existingState.pendingRequest = undefined;
        }

        existingState.lastSentAt = now;
        await sendTaskCompletedNotificationNow(
            userIds,
            taskId,
            taskType,
            'progress',
            context,
            payload,
        );
        return;
    }

    existingState.pendingRequest = {
        userIds,
        taskId,
        taskType,
        context,
        payload,
    };

    if (!existingState.pendingTimer) {
        scheduleProgressNotification(
            taskId,
            existingState,
            PROGRESS_NOTIFICATION_THROTTLE_MS - elapsedMs,
        );
    }

    logger.debug('task progress notification coalesced', {
        taskId,
        taskType,
        throttleMs: PROGRESS_NOTIFICATION_THROTTLE_MS,
        nextNotificationInMs: PROGRESS_NOTIFICATION_THROTTLE_MS - elapsedMs,
    });
};

export const sendTaskCompletedNotification = async (
    userIds: string[],
    taskId: string,
    taskType: BackgroundTaskType,
    status: TaskCompletionNotificationStatus,
    context?: RequestLogContext,
    payload?: Record<string, unknown>,
): Promise<void> => {
    if (status === 'progress') {
        await sendThrottledProgressNotification(userIds, taskId, taskType, context, payload);
        return;
    }

    clearPendingProgressNotification(taskId);
    await sendTaskCompletedNotificationNow(userIds, taskId, taskType, status, context, payload);
};

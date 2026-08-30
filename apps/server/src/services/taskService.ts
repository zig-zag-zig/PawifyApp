import { createLogger } from '../common/logging/logger.js';
import { backgroundTaskConfig } from '../config/runtimeConfig.js';
import type {
    BackgroundTaskResultPayload,
    BackgroundTaskType,
    CompositeTaskSessionController,
    TaskSessionController,
} from '../utils/types/taskTypes.js';
import { BackgroundTaskRuntime } from './tasks/backgroundTaskRuntime.js';

const taskRuntime = new BackgroundTaskRuntime({
    cleanupIntervalMs: backgroundTaskConfig.cleanupIntervalMs,
    logger: createLogger('services.tasks'),
    maxConcurrency: backgroundTaskConfig.maxConcurrency,
    pendingOrphanTtlMs: backgroundTaskConfig.pendingOrphanTtlMs,
    resultRetentionMs: backgroundTaskConfig.resultRetentionMs,
    workerTimeoutMs: backgroundTaskConfig.workerTimeoutMs,
});

taskRuntime.startCleanup();

export const createBackgroundTaskSession = <T extends BackgroundTaskResultPayload>(
    userId: string,
    type: BackgroundTaskType,
    options?: {
        dedupeKey?: string;
        initialResult?: T;
        notifyOnCompletion?: boolean;
        parentTaskId?: string;
    },
): TaskSessionController<T> & { reused: boolean } => {
    return taskRuntime.createBackgroundTaskSession(userId, type, options);
};

export const createCompositeBackgroundTaskSession = <T extends BackgroundTaskResultPayload>(
    userId: string,
    type: BackgroundTaskType,
    options?: {
        dedupeKey?: string;
        initialResult?: T;
    },
): CompositeTaskSessionController<T> & { reused: boolean } => {
    return taskRuntime.createCompositeBackgroundTaskSession(userId, type, options);
};

export const getTaskResultForUser = (userId: string, taskId: string) => {
    return taskRuntime.getTaskResultForUser(userId, taskId);
};

export const addTaskUser = (taskId: string, userId: string): void => {
    taskRuntime.addTaskUser(taskId, userId);
};

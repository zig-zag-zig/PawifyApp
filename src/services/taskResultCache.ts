import type { TaskResultResponse } from '../types/apiTypes';
import { EventService } from './eventService';
import type { ApiCallError } from './apiErrors';

export type PartialTaskResultListener = (taskResult: TaskResultResponse<unknown>) => void | Promise<void>;

type PendingTaskResultWait = {
  promise: Promise<TaskResultResponse<unknown>>;
  partialListeners: Set<PartialTaskResultListener>;
};

const taskResultCache = new Map<string, TaskResultResponse<unknown>>();
const taskResultCacheOrder: string[] = [];
const pendingTaskResultWaits = new Map<string, PendingTaskResultWait>();
const maxCachedTaskResults = 250;

export const getCachedTaskResult = <T>(taskId: string): TaskResultResponse<T> | undefined => (
  taskResultCache.get(taskId) as TaskResultResponse<T> | undefined
);

export const cacheTaskResult = (taskId: string, result: TaskResultResponse<unknown>): void => {
  if (!taskResultCache.has(taskId)) {
    taskResultCacheOrder.push(taskId);
  }

  taskResultCache.set(taskId, result);
  EventService.markTaskHandled(taskId);

  while (taskResultCacheOrder.length > maxCachedTaskResults) {
    const oldestTaskId = taskResultCacheOrder.shift();
    if (oldestTaskId) {
      taskResultCache.delete(oldestTaskId);
    }
  }
};

export const getPendingTaskResultWait = <T>(taskId: string): PendingTaskResultWait & {
  promise: Promise<TaskResultResponse<T>>;
} | undefined => (
  pendingTaskResultWaits.get(taskId) as PendingTaskResultWait & {
    promise: Promise<TaskResultResponse<T>>;
  } | undefined
);

export const setPendingTaskResultWait = (
  taskId: string,
  waitPromise: Promise<TaskResultResponse<unknown>>,
): void => {
  pendingTaskResultWaits.set(taskId, {
    promise: waitPromise,
    partialListeners: new Set(),
  });
};

export const addPendingTaskResultPartialListener = (
  taskId: string,
  listener: PartialTaskResultListener,
): void => {
  pendingTaskResultWaits.get(taskId)?.partialListeners.add(listener);
};

export const notifyPendingTaskResultPartialListeners = async (
  taskId: string,
  taskResult: TaskResultResponse<unknown>,
): Promise<void> => {
  const pendingWait = pendingTaskResultWaits.get(taskId);
  if (!pendingWait || pendingWait.partialListeners.size === 0) {
    return;
  }

  await Promise.all(
    Array.from(pendingWait.partialListeners).map(async listener => {
      await listener(taskResult);
    })
  );
};

export const deletePendingTaskResultWait = (taskId: string): void => {
  pendingTaskResultWaits.delete(taskId);
};

export const isTerminalTaskStatus = (status: string): boolean => {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === 'completed' ||
    normalizedStatus === 'failed' ||
    normalizedStatus === 'error';
};

export const createMissingTaskResult = <T>(taskId: string, error: ApiCallError): TaskResultResponse<T> => {
  return {
    taskId,
    type: 'unknown',
    status: 'failed',
    createdAt: new Date().toISOString(),
    error: {
      statusCode: error.statusCode,
      message: error.userMessage ?? error.message,
    },
  };
};

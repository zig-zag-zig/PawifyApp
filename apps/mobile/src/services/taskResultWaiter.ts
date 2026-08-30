import { ENV } from '../config/env';
import type { TaskResultResponse } from '../types/apiTypes';
import {
  addPendingTaskResultPartialListener,
  cacheTaskResult,
  createMissingTaskResult,
  deletePendingTaskResultWait,
  getCachedTaskResult,
  getPendingTaskResultWait,
  isTerminalTaskStatus,
  notifyPendingTaskResultPartialListeners,
  setPendingTaskResultWait,
} from './taskResultCache';
import {
  describeError,
  describeIds,
  describeValueShape,
  diagnosticError,
  diagnosticLog,
  diagnosticWarn,
  elapsedSince,
} from '../utils/diagnostics';
import { isApiCallError } from './apiErrors';
import { EventService } from './eventService';
import { TaskResultSignalWaiter, type TaskResultWaitSignal } from './taskResultSignalWaiter';
import { assertCompletedParentHasAllSubtaskIds } from '../shared/taskResults/taskResultPayload';
import {
  fetchAndMergeAvailableSubtasks,
  type TaskResultFetchSource,
} from '../shared/taskResults/taskResultSubtasks';

export type WaitForTaskResultOptions = {
  pollIntervalMs?: number;
  notificationWaitMs?: number;
  timeoutMs?: number;
  onPartialResult?: <TPartial>(taskResult: TaskResultResponse<TPartial>) => void | Promise<void>;
  recreateTask?: (expiredTaskId: string) => Promise<string | null | undefined>;
  maxRecreateAttempts?: number;
  recreateTaskDescription?: string;
};

const defaultNotificationWaitMs = ENV.taskResultNotificationWaitMs;
const defaultFallbackPollIntervalMs = ENV.taskResultPollIntervalMs;
const defaultTaskResultTimeoutMs = ENV.taskResultTimeoutMs;

function getFetchSourceForSignal(signal: TaskResultWaitSignal): TaskResultFetchSource {
  if (signal === 'event') {
    return 'fcm';
  }

  if (signal === 'resume') {
    return 'resume';
  }

  return 'polling';
}

function getNotificationWaitMs(options?: WaitForTaskResultOptions): number {
  const configuredWaitMs = options?.notificationWaitMs ?? defaultNotificationWaitMs;

  if (options?.notificationWaitMs !== undefined) {
    return configuredWaitMs;
  }

  return EventService.getClientPushToken() ? configuredWaitMs : 0;
}

export const waitForTaskResultFromSignals = async <T>(
  taskId: string,
  getTaskResult: <TResult>(taskId: string) => Promise<TaskResultResponse<TResult>>,
  options?: WaitForTaskResultOptions,
): Promise<TaskResultResponse<T>> => {
  const initialTaskId = taskId;
  const cachedTaskResult = getCachedTaskResult<T>(initialTaskId);
  if (cachedTaskResult) {
    diagnosticLog('task-result', 'cache-hit', {
      taskId: initialTaskId,
      status: cachedTaskResult.status,
      type: cachedTaskResult.type,
      resultShape: describeValueShape(cachedTaskResult.result),
    });
    return cachedTaskResult;
  }

  const pendingWait = getPendingTaskResultWait<T>(initialTaskId);
  if (pendingWait) {
    if (options?.onPartialResult) {
      addPendingTaskResultPartialListener(
        initialTaskId,
        options.onPartialResult as (taskResult: TaskResultResponse<unknown>) => void | Promise<void>
      );
    }
    diagnosticLog('task-result', 'pending-wait-reused', {
      taskId: initialTaskId,
      addedPartialListener: options?.onPartialResult !== undefined,
    });
    return await pendingWait.promise;
  }

  const waitPromise = (async (): Promise<TaskResultResponse<T>> => {
    let currentTaskId = initialTaskId;
    const fallbackFetchIntervalMs = options?.pollIntervalMs ?? defaultFallbackPollIntervalMs;
    const notificationWaitMs = getNotificationWaitMs(options);
    const timeoutMs = options?.timeoutMs ?? defaultTaskResultTimeoutMs;
    const waitStartedAt = Date.now();
    let lastError: unknown = null;
    let pollingStarted = false;
    let lastFetchAttemptAt = 0;
    let fetchAttemptCount = 0;
    let recreateAttempts = 0;
    const maxRecreateAttempts = options?.maxRecreateAttempts ?? (options?.recreateTask ? 1 : 0);
    const seenSubtaskIds = new Set<string>();
    const signalWaiter = new TaskResultSignalWaiter({
      fallbackFetchIntervalMs,
      getLastFetchAttemptAt: () => lastFetchAttemptAt,
      getPollingStarted: () => pollingStarted,
      notificationWaitMs,
      timeoutMs,
      waitStartedAt,
    });

    const tryRecreateExpiredTask = async (expiredTaskId: string) => {
      if (!options?.recreateTask || recreateAttempts >= maxRecreateAttempts) {
        return false;
      }

      recreateAttempts += 1;
      diagnosticWarn('task-result', 'recreate-start', {
        expiredTaskId,
        attempt: recreateAttempts,
        maxAttempts: maxRecreateAttempts,
        description: options.recreateTaskDescription,
      });

      const nextTaskId = await options.recreateTask(expiredTaskId);
      if (!nextTaskId || nextTaskId === expiredTaskId) {
        diagnosticWarn('task-result', 'recreate-empty', {
          expiredTaskId,
          nextTaskId,
          attempt: recreateAttempts,
          description: options.recreateTaskDescription,
        });
        return false;
      }

      currentTaskId = nextTaskId;
      lastError = null;
      lastFetchAttemptAt = 0;
      fetchAttemptCount = 0;
      pollingStarted = false;
      seenSubtaskIds.clear();
      signalWaiter.resetDeadline();

      diagnosticLog('task-result', 'recreate-done', {
        expiredTaskId,
        nextTaskId,
        attempt: recreateAttempts,
        description: options.recreateTaskDescription,
      });
      return true;
    };

    diagnosticLog('task-result', 'wait-start', {
      taskId: currentTaskId,
      notificationWaitMs,
      fallbackFetchIntervalMs,
      timeoutMs,
    });

    const fetchTerminalTaskResultOnce = async (
      fetchSource: TaskResultFetchSource,
      signal: TaskResultWaitSignal,
    ): Promise<TaskResultResponse<T> | null> => {
      lastFetchAttemptAt = Date.now();
      fetchAttemptCount += 1;
      diagnosticLog('task-result', 'fetch-start', {
        taskId: currentTaskId,
        attempt: fetchAttemptCount,
        fetchSource,
        signal,
        elapsedMs: elapsedSince(waitStartedAt),
      });
      const current = await getTaskResult<T>(currentTaskId);
      lastError = null;
      const isTerminal = isTerminalTaskStatus(current.status);

      diagnosticLog('task-result', 'fetch-done', {
        taskId: currentTaskId,
        attempt: fetchAttemptCount,
        fetchSource,
        signal,
        fetchMs: elapsedSince(lastFetchAttemptAt),
        elapsedMs: elapsedSince(waitStartedAt),
        status: current.status,
        type: current.type,
        isTerminal,
        hasResult: current.result !== undefined,
        hasError: current.error !== undefined,
        resultShape: describeValueShape(current.result),
        errorShape: current.error !== undefined ? describeValueShape(current.error) : undefined,
        subtaskCount: current.subtaskCount,
        completedSubtaskCount: current.completedSubtaskCount,
      });

      if (!isTerminal) {
        const {
          taskResult: partialCurrent,
          newlyFetchedSubtaskIds,
        } = await fetchAndMergeAvailableSubtasks(current, getTaskResult, {
          fetchSource,
          requireTerminalSubtasks: false,
          seenSubtaskIds,
          signal,
          waitStartedAt,
          visitedTaskIds: new Set([currentTaskId]),
        });

        if (newlyFetchedSubtaskIds.length > 0) {
          diagnosticLog('task-result', 'partial-result', {
            taskId: currentTaskId,
            fetchedSubtaskIds: describeIds(newlyFetchedSubtaskIds),
            fetchedSubtaskCount: newlyFetchedSubtaskIds.length,
            resultShape: describeValueShape(partialCurrent.result),
            elapsedMs: elapsedSince(waitStartedAt),
          });

          await notifyPendingTaskResultPartialListeners(initialTaskId, partialCurrent as TaskResultResponse<unknown>);
        }

        return null;
      }

      assertCompletedParentHasAllSubtaskIds(current as TaskResultResponse<unknown>);

      const {
        taskResult: resolvedCurrent,
        expectedSubtaskIds,
        fetchedSubtaskIds,
        newlyFetchedSubtaskIds,
      } = await fetchAndMergeAvailableSubtasks(current, getTaskResult, {
        fetchSource,
        requireTerminalSubtasks: current.status.toLowerCase() === 'completed',
        seenSubtaskIds,
        signal,
        waitStartedAt,
        visitedTaskIds: new Set([currentTaskId]),
      });

      if (expectedSubtaskIds.length > 0 && fetchedSubtaskIds.length !== expectedSubtaskIds.length) {
        diagnosticWarn('task-result', 'terminal-subtasks-not-fully-fetched', {
          taskId: currentTaskId,
          expectedSubtaskIds: describeIds(expectedSubtaskIds),
          fetchedSubtaskIds: describeIds(fetchedSubtaskIds),
        });
        throw new Error(`Failed to fetch all subtasks for task: ${currentTaskId}`);
      }

      if (newlyFetchedSubtaskIds.length > 0) {
        diagnosticLog('task-result', 'terminal-partial-result', {
          taskId: currentTaskId,
          fetchedSubtaskIds: describeIds(newlyFetchedSubtaskIds),
          fetchedSubtaskCount: newlyFetchedSubtaskIds.length,
          resultShape: describeValueShape(resolvedCurrent.result),
          elapsedMs: elapsedSince(waitStartedAt),
        });

        await notifyPendingTaskResultPartialListeners(initialTaskId, resolvedCurrent as TaskResultResponse<unknown>);
      }

      cacheTaskResult(currentTaskId, resolvedCurrent as TaskResultResponse<unknown>);
      diagnosticLog('task-result', 'terminal-cached', {
        taskId: currentTaskId,
        status: resolvedCurrent.status,
        type: resolvedCurrent.type,
        elapsedMs: elapsedSince(waitStartedAt),
        attempts: fetchAttemptCount,
        fetchSource,
        signal,
        subtaskCount: resolvedCurrent.subtaskCount,
        completedSubtaskCount: resolvedCurrent.completedSubtaskCount,
        fetchedSubtaskCount: fetchedSubtaskIds.length,
        resultShape: describeValueShape(resolvedCurrent.result),
      });
      return resolvedCurrent;
    };

    while (true) {
      const cachedTaskResult = getCachedTaskResult<T>(currentTaskId);
      if (cachedTaskResult) {
        return cachedTaskResult;
      }

      let signal: TaskResultWaitSignal | null = null;
      try {
        signal = await signalWaiter.waitForNextSignal(currentTaskId);
        diagnosticLog('task-result', 'signal', {
          taskId: currentTaskId,
          signal,
          pollingStarted,
          elapsedMs: elapsedSince(waitStartedAt),
        });
        if (signal === 'overall-timeout') {
          break;
        }

        const fetchSource = getFetchSourceForSignal(signal);
        pollingStarted = pollingStarted ||
          signal === 'notification-timeout' ||
          signal === 'poll-timeout';

        const terminalResult = await fetchTerminalTaskResultOnce(fetchSource, signal);
        if (terminalResult) {
          return terminalResult;
        }
      } catch (error) {
        if (isApiCallError(error) && error.statusCode === 404) {
          lastError = error;
          diagnosticWarn('task-result', 'result-404', {
            taskId: currentTaskId,
            signal,
            elapsedMs: elapsedSince(waitStartedAt),
            attempts: fetchAttemptCount,
            error: describeError(error),
            willReturnMissingResult: signal === 'event',
          });
          const recreated = await tryRecreateExpiredTask(currentTaskId);
          if (recreated) {
            continue;
          }

          if (signal === 'event') {
            return createMissingTaskResult<T>(currentTaskId, error);
          }

          continue;
        }

        if (isApiCallError(error) && error.statusCode === 400) {
          diagnosticError('task-result', 'fatal-api-error', {
            taskId: currentTaskId,
            signal,
            elapsedMs: elapsedSince(waitStartedAt),
            attempts: fetchAttemptCount,
            error: describeError(error),
          });
          throw error;
        }

        lastError = error;
        diagnosticWarn('task-result', 'wait-error', {
          taskId: currentTaskId,
          signal,
          elapsedMs: elapsedSince(waitStartedAt),
          attempts: fetchAttemptCount,
          error: describeError(error),
        });
      }

      const remainingTimeoutMs = signalWaiter.getRemainingTimeoutMs();
      if (remainingTimeoutMs !== null && remainingTimeoutMs <= 0) {
        break;
      }
    }

    diagnosticWarn('task-result', 'wait-timeout', {
      taskId: currentTaskId,
      initialTaskId,
      elapsedMs: elapsedSince(waitStartedAt),
      attempts: fetchAttemptCount,
      pollingStarted,
      lastError: lastError ? describeError(lastError) : null,
    });

    throw lastError instanceof Error
      ? lastError
      : new Error(`Timed out waiting for task result: ${currentTaskId}`);
  })();

  setPendingTaskResultWait(initialTaskId, waitPromise as Promise<TaskResultResponse<unknown>>);
  if (options?.onPartialResult) {
    addPendingTaskResultPartialListener(
      initialTaskId,
      options.onPartialResult as (taskResult: TaskResultResponse<unknown>) => void | Promise<void>
    );
  }

  try {
    return await waitPromise;
  } finally {
    deletePendingTaskResultWait(initialTaskId);
  }
};

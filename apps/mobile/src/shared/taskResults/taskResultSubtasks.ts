import type { TaskResultResponse } from '../../types/apiTypes';
import {
  describeIds,
  describeValueShape,
  diagnosticLog,
  elapsedSince,
} from '../../utils/diagnostics';
import type { TaskResultWaitSignal } from '../../services/taskResultSignalWaiter';
import {
  cacheTaskResult,
  getCachedTaskResult,
  isTerminalTaskStatus,
} from '../../services/taskResultCache';
import {
  getTaskSubtaskIds,
  mergeTaskResultPayload,
} from './taskResultPayload';

export type TaskResultFetchSource = 'fcm' | 'polling' | 'resume';

export type SubtaskMergeResult<T> = {
  taskResult: TaskResultResponse<T>;
  expectedSubtaskIds: string[];
  fetchedSubtaskIds: string[];
  newlyFetchedSubtaskIds: string[];
};

export async function fetchAndMergeAvailableSubtasks<T>(
  taskResult: TaskResultResponse<T>,
  getTaskResult: <TResult>(taskId: string) => Promise<TaskResultResponse<TResult>>,
  options: {
    fetchSource: TaskResultFetchSource;
    requireTerminalSubtasks: boolean;
    seenSubtaskIds: Set<string>;
    signal: TaskResultWaitSignal;
    waitStartedAt: number;
    visitedTaskIds: Set<string>;
  },
): Promise<SubtaskMergeResult<T>> {
  const subtaskIds = getTaskSubtaskIds(taskResult as TaskResultResponse<unknown>);
  if (subtaskIds.length === 0) {
    return {
      taskResult,
      expectedSubtaskIds: [],
      fetchedSubtaskIds: [],
      newlyFetchedSubtaskIds: [],
    };
  }

  diagnosticLog('task-result', 'subtasks-fetch-start', {
    taskId: taskResult.taskId,
    subtaskCount: subtaskIds.length,
    subtaskIds: describeIds(subtaskIds),
    fetchSource: options.fetchSource,
    requireTerminalSubtasks: options.requireTerminalSubtasks,
    signal: options.signal,
    elapsedMs: elapsedSince(options.waitStartedAt),
  });

  let mergedResult: unknown = taskResult.result;
  const fetchedSubtaskIds: string[] = [];
  const newlyFetchedSubtaskIds: string[] = [];

  for (const subtaskId of subtaskIds) {
    if (options.visitedTaskIds.has(subtaskId)) {
      continue;
    }

    options.visitedTaskIds.add(subtaskId);
    const cachedSubtaskResult = getCachedTaskResult<unknown>(subtaskId);
    const subtaskFetchStartedAt = Date.now();

    diagnosticLog('task-result', 'subtask-fetch-start', {
      taskId: taskResult.taskId,
      subtaskId,
      fromCache: cachedSubtaskResult !== undefined,
      fetchSource: options.fetchSource,
      signal: options.signal,
      elapsedMs: elapsedSince(options.waitStartedAt),
    });

    const rawSubtaskResult = cachedSubtaskResult ?? await getTaskResult<unknown>(subtaskId);
    const {
      taskResult: subtaskResult,
      newlyFetchedSubtaskIds: nestedNewlyFetchedSubtaskIds,
    } = await fetchAndMergeAvailableSubtasks(rawSubtaskResult, getTaskResult, options);
    const subtaskStatus = subtaskResult.status.toLowerCase();

    diagnosticLog('task-result', 'subtask-fetch-done', {
      taskId: taskResult.taskId,
      subtaskId,
      status: subtaskResult.status,
      type: subtaskResult.type,
      isTerminal: isTerminalTaskStatus(subtaskResult.status),
      hasResult: subtaskResult.result !== undefined,
      hasError: subtaskResult.error !== undefined,
      resultShape: describeValueShape(subtaskResult.result),
      fetchMs: elapsedSince(subtaskFetchStartedAt),
      elapsedMs: elapsedSince(options.waitStartedAt),
    });

    if (!isTerminalTaskStatus(subtaskResult.status)) {
      if (options.requireTerminalSubtasks) {
        throw new Error(`Task subtask was not complete: ${subtaskId}`);
      }

      continue;
    }

    cacheTaskResult(subtaskId, subtaskResult as TaskResultResponse<unknown>);
    fetchedSubtaskIds.push(subtaskId);
    nestedNewlyFetchedSubtaskIds.forEach(id => newlyFetchedSubtaskIds.push(id));

    if (subtaskStatus !== 'completed') {
      if (options.requireTerminalSubtasks) {
        throw new Error(`Task subtask failed: ${subtaskId}`);
      }

      continue;
    }

    if (!options.seenSubtaskIds.has(subtaskId)) {
      options.seenSubtaskIds.add(subtaskId);
      newlyFetchedSubtaskIds.push(subtaskId);
    }

    mergedResult = mergeTaskResultPayload(mergedResult, subtaskResult.result);
  }

  const mergedTaskResult = {
    ...taskResult,
    result: mergedResult as T,
  };

  diagnosticLog('task-result', 'subtasks-fetch-done', {
    taskId: taskResult.taskId,
    subtaskCount: subtaskIds.length,
    fetchedSubtaskIds: describeIds(fetchedSubtaskIds),
    fetchedSubtaskCount: fetchedSubtaskIds.length,
    allSubtasksFetched: fetchedSubtaskIds.length === subtaskIds.length,
    resultShape: describeValueShape(mergedTaskResult.result),
    elapsedMs: elapsedSince(options.waitStartedAt),
  });

  return {
    taskResult: mergedTaskResult,
    expectedSubtaskIds: subtaskIds,
    fetchedSubtaskIds,
    newlyFetchedSubtaskIds,
  };
}

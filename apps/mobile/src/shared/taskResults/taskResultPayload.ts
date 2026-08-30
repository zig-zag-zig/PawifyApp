import type { TaskResultResponse } from '../../types/apiTypes';
import {
  describeIds,
  diagnosticWarn,
} from '../../utils/diagnostics';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mergeTaskResultPayload(target: unknown, patch: unknown): unknown {
  if (patch === undefined) {
    return target;
  }

  if (!isPlainObject(target) || !isPlainObject(patch)) {
    return patch;
  }

  const merged: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    const currentValue = merged[key];

    if (isPlainObject(currentValue) && isPlainObject(value)) {
      merged[key] = {
        ...currentValue,
        ...value,
      };
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

export function getTaskSubtaskIds(taskResult: TaskResultResponse<unknown>): string[] {
  const candidateSubtaskIds = taskResult.status.toLowerCase() === 'completed'
    ? [
      ...(Array.isArray(taskResult.subtaskIds) ? taskResult.subtaskIds : []),
      ...(Array.isArray(taskResult.completedSubtaskIds) ? taskResult.completedSubtaskIds : []),
    ]
    : (Array.isArray(taskResult.completedSubtaskIds) ? taskResult.completedSubtaskIds : []);

  return Array.from(new Set(
    candidateSubtaskIds.filter((taskId): taskId is string => typeof taskId === 'string' && taskId.length > 0)
  ));
}

export function assertCompletedParentHasAllSubtaskIds(taskResult: TaskResultResponse<unknown>): void {
  const subtaskCount = taskResult.subtaskCount ?? 0;
  if (taskResult.status.toLowerCase() !== 'completed' || subtaskCount <= 0) {
    return;
  }

  const subtaskIds = getTaskSubtaskIds(taskResult);
  if (subtaskIds.length === subtaskCount) {
    return;
  }

  diagnosticWarn('task-result', 'completed-parent-subtasks-incomplete', {
    taskId: taskResult.taskId,
    subtaskCount,
    subtaskIds: describeIds(subtaskIds),
  });
  throw new Error(`Completed task is missing subtask ids: ${taskResult.taskId}`);
}

import type { TaskResultResponse } from '../../types/apiTypes';
import type { WaitForTaskResultOptions } from '../../services/taskResultWaiter';
import { fillMissingIdsWithNull } from '../../utils/nullableMaps';
import type { NullableStringMap } from '../../utils/nullableMaps';

type WaitForTaskResult = <T>(
  taskId: string,
  options?: WaitForTaskResultOptions,
) => Promise<TaskResultResponse<T>>;

export type ResolveNullableTaskMapPhase =
  | 'missing-task'
  | 'partial'
  | 'completed'
  | 'non-completed'
  | 'error';

type ResolveNullableTaskMapOptions<TResult> = {
  taskId: string | null | undefined;
  expectedIds: string[];
  waitForTaskResult: WaitForTaskResult;
  extractMap: (result: unknown) => NullableStringMap;
  onResolvedValues: (
    values: NullableStringMap,
    resolvedIds: string[],
    phase: ResolveNullableTaskMapPhase,
  ) => void;
  onError?: (error: unknown) => void;
  shouldFillMissingOnError?: boolean;
  shouldFillMissingOnNonCompleted?: boolean;
  shouldFillMissingOnCompleted?: (taskResult: TaskResultResponse<TResult>) => boolean;
  recreateTask?: WaitForTaskResultOptions['recreateTask'];
  recreateTaskDescription?: string;
  waitOptions?: Omit<WaitForTaskResultOptions, 'onPartialResult' | 'recreateTask' | 'recreateTaskDescription'>;
};

function getResolvedIds(expectedIds: string[], values: NullableStringMap): string[] {
  return expectedIds.filter(id => values[id] !== undefined);
}

export async function resolveNullableTaskMap<TResult = unknown>({
  taskId,
  expectedIds,
  waitForTaskResult,
  extractMap,
  onResolvedValues,
  onError,
  shouldFillMissingOnError = true,
  shouldFillMissingOnNonCompleted = true,
  shouldFillMissingOnCompleted = () => true,
  recreateTask,
  recreateTaskDescription,
  waitOptions,
}: ResolveNullableTaskMapOptions<TResult>): Promise<void> {
  if (expectedIds.length === 0) {
    return;
  }

  if (!taskId) {
    onResolvedValues(fillMissingIdsWithNull(expectedIds, {}), expectedIds, 'missing-task');
    return;
  }

  try {
    const taskResult = await waitForTaskResult<TResult>(taskId, {
      ...waitOptions,
      onPartialResult: partialResult => {
        const partialValues = extractMap(partialResult.result);
        const resolvedIds = getResolvedIds(expectedIds, partialValues);
        if (resolvedIds.length === 0) {
          return;
        }

        onResolvedValues(partialValues, resolvedIds, 'partial');
      },
      recreateTask,
      recreateTaskDescription,
    });

    if (taskResult.status.toLowerCase() !== 'completed') {
      onResolvedValues(
        shouldFillMissingOnNonCompleted ? fillMissingIdsWithNull(expectedIds, {}) : {},
        expectedIds,
        'non-completed',
      );
      return;
    }

    const taskValues = extractMap(taskResult.result);
    if (!shouldFillMissingOnCompleted(taskResult)) {
      const resolvedIds = getResolvedIds(expectedIds, taskValues);
      if (resolvedIds.length > 0) {
        onResolvedValues(taskValues, resolvedIds, 'completed');
      }
      return;
    }

    onResolvedValues(fillMissingIdsWithNull(expectedIds, taskValues), expectedIds, 'completed');
  } catch (error) {
    onError?.(error);
    onResolvedValues(
      shouldFillMissingOnError ? fillMissingIdsWithNull(expectedIds, {}) : {},
      expectedIds,
      'error',
    );
  }
}

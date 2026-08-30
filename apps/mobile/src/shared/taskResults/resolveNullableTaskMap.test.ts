import { describe, expect, it, vi } from 'vitest';
import type { TaskResultResponse } from '../../types/apiTypes';
import type { WaitForTaskResultOptions } from '../../services/taskResultWaiter';
import { resolveNullableTaskMap } from './resolveNullableTaskMap';

function createCompletedTaskResult(result: unknown): TaskResultResponse<unknown> {
  return {
    taskId: 'task-1',
    type: 'image',
    status: 'completed',
    createdAt: '2026-06-07T00:00:00.000Z',
    result,
  };
}

describe('resolveNullableTaskMap', () => {
  it('applies partial values and null-fills unresolved ids on completion', async () => {
    const onResolvedValues = vi.fn();
    const waitForTaskResult = async <T,>(
      _taskId: string,
      options?: WaitForTaskResultOptions,
    ): Promise<TaskResultResponse<T>> => {
      await options?.onPartialResult?.(createCompletedTaskResult({
        images: {
          a: 'https://example.test/a.jpg',
        },
      }));
      return createCompletedTaskResult({
        images: {
          b: 'https://example.test/b.jpg',
        },
      }) as TaskResultResponse<T>;
    };

    await resolveNullableTaskMap({
      taskId: 'task-1',
      expectedIds: ['a', 'b', 'c'],
      waitForTaskResult,
      extractMap: result => (
        result && typeof result === 'object' && 'images' in result
          ? (result as { images: Record<string, string | null | undefined> }).images
          : {}
      ),
      onResolvedValues,
    });

    expect(onResolvedValues).toHaveBeenNthCalledWith(1, {
      a: 'https://example.test/a.jpg',
    }, ['a'], 'partial');
    expect(onResolvedValues).toHaveBeenNthCalledWith(2, {
      a: null,
      b: 'https://example.test/b.jpg',
      c: null,
    }, ['a', 'b', 'c'], 'completed');
  });

  it('marks every expected id unresolved when the task fails', async () => {
    const onResolvedValues = vi.fn();
    const onError = vi.fn();
    const error = new Error('failed');

    await resolveNullableTaskMap({
      taskId: 'task-1',
      expectedIds: ['a', 'b'],
      waitForTaskResult: async <T,>(): Promise<TaskResultResponse<T>> => {
        throw error;
      },
      extractMap: () => ({}),
      onResolvedValues,
      onError,
    });

    expect(onError).toHaveBeenCalledWith(error);
    expect(onResolvedValues).toHaveBeenCalledWith({
      a: null,
      b: null,
    }, ['a', 'b'], 'error');
  });

  it('can avoid null-filling completed composite task payloads', async () => {
    const onResolvedValues = vi.fn();

    await resolveNullableTaskMap({
      taskId: 'task-1',
      expectedIds: ['a', 'b'],
      waitForTaskResult: async <T,>(): Promise<TaskResultResponse<T>> => (
        {
          ...createCompletedTaskResult({
            images: {
              a: 'https://example.test/a.jpg',
            },
          }),
          subtaskCount: 2,
        } as TaskResultResponse<T>
      ),
      extractMap: result => (
        result && typeof result === 'object' && 'images' in result
          ? (result as { images: Record<string, string | null | undefined> }).images
          : {}
      ),
      onResolvedValues,
      shouldFillMissingOnCompleted: taskResult => (taskResult.subtaskCount ?? 0) === 0,
    });

    expect(onResolvedValues).toHaveBeenCalledWith({
      a: 'https://example.test/a.jpg',
    }, ['a'], 'completed');
  });

  it('does not wait when the task id is missing', async () => {
    let waitCallCount = 0;
    const waitForTaskResult = async <T,>(): Promise<TaskResultResponse<T>> => {
      waitCallCount += 1;
      return createCompletedTaskResult({}) as TaskResultResponse<T>;
    };
    const onResolvedValues = vi.fn();

    await resolveNullableTaskMap({
      taskId: null,
      expectedIds: ['a'],
      waitForTaskResult,
      extractMap: () => ({}),
      onResolvedValues,
    });

    expect(waitCallCount).toBe(0);
    expect(onResolvedValues).toHaveBeenCalledWith({ a: null }, ['a'], 'missing-task');
  });
});

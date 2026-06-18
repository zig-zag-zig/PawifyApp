import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDiagnostics } from '../../test/mocks';

vi.mock('../../utils/diagnostics', () => ({
    describeIds: mockDiagnostics().describeIds,
    describeValueShape: mockDiagnostics().describeValueShape,
    diagnosticLog: mockDiagnostics().diagnosticLog,
    elapsedSince: mockDiagnostics().elapsedSince,
}));

vi.mock('../../services/taskResultCache', () => ({
    cacheTaskResult: vi.fn(),
    getCachedTaskResult: vi.fn(),
    isTerminalTaskStatus: vi.fn((status: string) =>
        ['completed', 'failed', 'error'].includes(status.toLowerCase()),
    ),
}));

vi.mock('./taskResultPayload', () => ({
    getTaskSubtaskIds: vi.fn(() => []),
    mergeTaskResultPayload: vi.fn((a, b) => ({ ...(a as object), ...(b as object) })),
}));

import { fetchAndMergeAvailableSubtasks } from './taskResultSubtasks';
import {
    cacheTaskResult,
    getCachedTaskResult,
} from '../../services/taskResultCache';
import { getTaskSubtaskIds, mergeTaskResultPayload } from './taskResultPayload';
import type { TaskResultResponse } from '../../types/apiTypes';

function makeResult<T = unknown>(overrides: Partial<TaskResultResponse<T>> = {}): TaskResultResponse<T> {
    return {
        taskId: 'task-1',
        type: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        result: 'base-result' as unknown as T,
        ...overrides,
    };
}

function makeOptions(overrides: Record<string, unknown> = {}) {
    return {
        fetchSource: 'polling' as const,
        requireTerminalSubtasks: false,
        seenSubtaskIds: new Set<string>(),
        signal: 'poll-timeout' as const,
        waitStartedAt: Date.now(),
        visitedTaskIds: new Set<string>(),
        ...overrides,
    };
}

describe('taskResultSubtasks', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('fetchAndMergeAvailableSubtasks', () => {
        it('returns task unchanged when no subtask IDs', async () => {
            vi.mocked(getTaskSubtaskIds).mockReturnValue([]);

            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                vi.fn(),
                makeOptions(),
            );

            expect(result.expectedSubtaskIds).toEqual([]);
            expect(result.fetchedSubtaskIds).toEqual([]);
            expect(result.newlyFetchedSubtaskIds).toEqual([]);
        });

        it('skips already visited subtask IDs', async () => {
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1']);

            const getTaskResult = vi.fn();
            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                getTaskResult,
                makeOptions({ visitedTaskIds: new Set(['sub-1']) }),
            );

            expect(getTaskResult).not.toHaveBeenCalled();
            expect(result.fetchedSubtaskIds).toEqual([]);
        });

        it('throws when non-terminal subtask with requireTerminalSubtasks', async () => {
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1']);
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);

            const getTaskResult = vi.fn().mockResolvedValue(
                makeResult({ taskId: 'sub-1', status: 'running' }),
            );

            await expect(
                fetchAndMergeAvailableSubtasks(
                    makeResult(),
                    getTaskResult,
                    makeOptions({ requireTerminalSubtasks: true }),
                ),
            ).rejects.toThrow('Task subtask was not complete: sub-1');
        });

        it('skips non-terminal subtask when requireTerminalSubtasks is false', async () => {
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1']);
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);

            const getTaskResult = vi.fn().mockResolvedValue(
                makeResult({ taskId: 'sub-1', status: 'running' }),
            );

            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                getTaskResult,
                makeOptions({ requireTerminalSubtasks: false }),
            );

            // running subtask is skipped — not fetched, not merged
            expect(result.fetchedSubtaskIds).toEqual([]);
            expect(result.newlyFetchedSubtaskIds).toEqual([]);
        });

        it('uses cached subtask result without calling getTaskResult', async () => {
            const cachedSubtask = makeResult({ taskId: 'sub-1', status: 'completed', result: 'cached-value' });
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1']);
            vi.mocked(getCachedTaskResult).mockReturnValue(cachedSubtask as any);

            const getTaskResult = vi.fn();
            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                getTaskResult,
                makeOptions(),
            );

            expect(getTaskResult).not.toHaveBeenCalled();
            expect(result.fetchedSubtaskIds).toEqual(['sub-1']);
            expect(result.newlyFetchedSubtaskIds).toEqual(['sub-1']);
            expect(mergeTaskResultPayload).toHaveBeenCalledWith('base-result', 'cached-value');
        });

        it('fetches and merges a completed subtask', async () => {
            const fetchedSubtask = makeResult({ taskId: 'sub-1', status: 'completed', result: 'sub-result' });
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1']);
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);

            const getTaskResult = vi.fn().mockResolvedValue(fetchedSubtask);

            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                getTaskResult,
                makeOptions(),
            );

            expect(getTaskResult).toHaveBeenCalledWith('sub-1');
            expect(result.fetchedSubtaskIds).toEqual(['sub-1']);
            expect(result.newlyFetchedSubtaskIds).toEqual(['sub-1']);
            expect(cacheTaskResult).toHaveBeenCalledWith('sub-1', expect.objectContaining({ taskId: 'sub-1' }));
            expect(mergeTaskResultPayload).toHaveBeenCalledWith('base-result', 'sub-result');
        });

        it('throws when failed subtask with requireTerminalSubtasks', async () => {
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1']);
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);

            const getTaskResult = vi.fn().mockResolvedValue(
                makeResult({ taskId: 'sub-1', status: 'failed' }),
            );

            await expect(
                fetchAndMergeAvailableSubtasks(
                    makeResult(),
                    getTaskResult,
                    makeOptions({ requireTerminalSubtasks: true }),
                ),
            ).rejects.toThrow('Task subtask failed: sub-1');
        });

        it('skips failed subtask when requireTerminalSubtasks is false', async () => {
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1']);
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);

            const getTaskResult = vi.fn().mockResolvedValue(
                makeResult({ taskId: 'sub-1', status: 'failed' }),
            );

            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                getTaskResult,
                makeOptions({ requireTerminalSubtasks: false }),
            );

            // failed subtask is cached but not merged
            expect(cacheTaskResult).toHaveBeenCalledWith('sub-1', expect.any(Object));
            expect(result.fetchedSubtaskIds).toEqual(['sub-1']);
            expect(result.newlyFetchedSubtaskIds).toEqual([]);
            expect(mergeTaskResultPayload).not.toHaveBeenCalled();
        });

        it('handles recursive subtasks', async () => {
            // Parent task has sub-1, sub-1 itself has sub-2
            vi.mocked(getTaskSubtaskIds).mockImplementation(
                (tr: any) => {
                    if (tr?.taskId === 'task-1') return ['sub-1'];
                    if (tr?.taskId === 'sub-1') return ['sub-2'];
                    return [];
                },
            );
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);

            const getTaskResult = vi.fn(async (id: string) => {
                if (id === 'sub-1') return makeResult({ taskId: 'sub-1', status: 'completed', result: 'sub1-result' });
                if (id === 'sub-2') return makeResult({ taskId: 'sub-2', status: 'completed', result: 'sub2-result' });
                throw new Error('unexpected');
            });

            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                getTaskResult as any,
                makeOptions(),
            );

            expect(result.fetchedSubtaskIds).toEqual(['sub-1']);
            // mergeTaskResultPayload called for sub-2 merge (sub1 base merge) and sub-1 merge (parent merge)
            expect(mergeTaskResultPayload).toHaveBeenCalledTimes(2);
        });

        it('tracks newlyFetchedSubtasks separately from previously seen', async () => {
            vi.mocked(getTaskSubtaskIds).mockReturnValue(['sub-1', 'sub-2']);
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);

            const getTaskResult = vi.fn(async (id: string) => {
                if (id === 'sub-1') return makeResult({ taskId: 'sub-1', status: 'completed', result: 'r1' });
                if (id === 'sub-2') return makeResult({ taskId: 'sub-2', status: 'completed', result: 'r2' });
                throw new Error('unexpected');
            });

            const seen = new Set<string>(['sub-1']);

            const result = await fetchAndMergeAvailableSubtasks(
                makeResult(),
                getTaskResult as any,
                makeOptions({ seenSubtaskIds: seen }),
            );

            // sub-1 was already seen, so not in newlyFetched
            // fetchedSubtaskIds only contains IDs fetched at the parent level
            // (sub-2 is fetched recursively inside sub-1 and not added to parent's fetchedSubtaskIds)
            expect(result.fetchedSubtaskIds).toEqual(['sub-1']);
            expect(result.newlyFetchedSubtaskIds).toEqual(['sub-2']);
        });
    });
});

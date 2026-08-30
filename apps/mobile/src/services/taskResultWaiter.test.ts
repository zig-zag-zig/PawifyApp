import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDiagnostics } from '../test/mocks';

vi.mock('../config/env', () => ({
    ENV: {
        taskResultNotificationWaitMs: 5000,
        taskResultPollIntervalMs: 1000,
        taskResultTimeoutMs: 30000,
    },
}));

vi.mock('../utils/diagnostics', () => mockDiagnostics());

vi.mock('./apiErrors', () => ({
    isApiCallError: vi.fn((error: unknown) => {
        if (error && typeof error === 'object' && 'statusCode' in error) {
            const code = (error as Record<string, unknown>).statusCode;
            return code === 404 || code === 400 || code === 401;
        }
        return false;
    }),
}));

vi.mock('./eventService', () => ({
    EventService: {
        getClientPushToken: vi.fn(() => null),
        markTaskHandled: vi.fn(),
    },
}));

vi.mock('./taskResultCache', () => ({
    cacheTaskResult: vi.fn(),
    createMissingTaskResult: vi.fn((taskId: string, _error: unknown) => ({
        taskId,
        type: 'unknown',
        status: 'failed',
        createdAt: new Date().toISOString(),
    })),
    deletePendingTaskResultWait: vi.fn(),
    getCachedTaskResult: vi.fn(),
    getPendingTaskResultWait: vi.fn(),
    isTerminalTaskStatus: vi.fn((status: string) =>
        ['completed', 'failed', 'error'].includes(status.toLowerCase()),
    ),
    setPendingTaskResultWait: vi.fn(),
    addPendingTaskResultPartialListener: vi.fn(),
}));

vi.mock('../shared/taskResults/taskResultPayload', () => ({
    assertCompletedParentHasAllSubtaskIds: vi.fn(),
    mergeTaskResultPayload: vi.fn((a, b) => ({ ...(a as object), ...(b as object) })),
}));

vi.mock('../shared/taskResults/taskResultSubtasks', () => ({
    fetchAndMergeAvailableSubtasks: vi.fn(
        async (taskResult: any) => ({
            taskResult,
            expectedSubtaskIds: [],
            fetchedSubtaskIds: [],
            newlyFetchedSubtaskIds: [],
        }),
    ),
}));

vi.mock('./taskResultSignalWaiter', () => ({
    TaskResultSignalWaiter: class {
        private callCount = 0;
        async waitForNextSignal() {
            this.callCount++;
            if (this.callCount === 1) return 'notification-timeout';
            return 'poll-timeout';
        }
        getRemainingTimeoutMs() { return 10000; }
        resetDeadline() { }
    },
}));

import { waitForTaskResultFromSignals } from './taskResultWaiter';
import { getCachedTaskResult, getPendingTaskResultWait } from './taskResultCache';
import type { TaskResultResponse } from '../types/apiTypes';

function makeTerminalResult(
    taskId: string,
    overrides: Partial<TaskResultResponse<string>> = {},
): TaskResultResponse<string> {
    return {
        taskId,
        type: 'test',
        status: 'completed',
        createdAt: new Date().toISOString(),
        result: 'test-result',
        ...overrides,
    };
}

describe('taskResultWaiter', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('waitForTaskResultFromSignals', () => {
        it('returns cached result immediately without polling', async () => {
            const cached = makeTerminalResult('task-1');
            vi.mocked(getCachedTaskResult).mockReturnValue(cached);

            const getTaskResult = vi.fn();
            const result = await waitForTaskResultFromSignals('task-1', getTaskResult);
            expect(result).toBe(cached);
            expect(getTaskResult).not.toHaveBeenCalled();
        });

        it('reuses pending wait for same taskId', async () => {
            const terminal = makeTerminalResult('task-2');
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);
            vi.mocked(getPendingTaskResultWait).mockReturnValue({
                promise: Promise.resolve(terminal),
            } as any);

            const result = await waitForTaskResultFromSignals('task-2', vi.fn());
            expect(result.taskId).toBe('task-2');
        });

        it('resolves terminal task result during polling cycle', async () => {
            vi.mocked(getCachedTaskResult).mockReturnValue(undefined);
            vi.mocked(getPendingTaskResultWait).mockReturnValue(undefined);

            const terminalResult = makeTerminalResult('task-3', { status: 'completed' });
            // First call returns running (triggers polling), second returns completed.
            const getTaskResult = vi.fn()
                .mockResolvedValueOnce(makeTerminalResult('task-3', { status: 'running' }))
                .mockResolvedValueOnce(terminalResult);

            const result = await waitForTaskResultFromSignals('task-3', getTaskResult, {
                notificationWaitMs: 100,
                pollIntervalMs: 100,
            });

            expect(result.status).toBe('completed');
            expect(getTaskResult).toHaveBeenCalledTimes(2);
        });
    });
});

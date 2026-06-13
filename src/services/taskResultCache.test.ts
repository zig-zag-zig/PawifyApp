import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/diagnostics', () => ({
    describeValueShape: vi.fn(() => ({})),
    diagnosticLog: vi.fn(),
    diagnosticWarn: vi.fn(),
}));

vi.mock('../services/eventService', () => ({
    EventService: {
        markTaskHandled: vi.fn(),
    },
}));

describe('taskResultCache', () => {
    afterEach(() => {
        vi.resetModules();
    });

    async function loadModule() {
        return import('./taskResultCache');
    }

    describe('isTerminalTaskStatus', () => {
        it('returns true for "completed"', async () => {
            const { isTerminalTaskStatus } = await loadModule();
            expect(isTerminalTaskStatus('completed')).toBe(true);
        });

        it('returns true for "failed"', async () => {
            const { isTerminalTaskStatus } = await loadModule();
            expect(isTerminalTaskStatus('failed')).toBe(true);
        });

        it('returns true for "error"', async () => {
            const { isTerminalTaskStatus } = await loadModule();
            expect(isTerminalTaskStatus('error')).toBe(true);
        });

        it('is case-insensitive', async () => {
            const { isTerminalTaskStatus } = await loadModule();
            expect(isTerminalTaskStatus('Completed')).toBe(true);
            expect(isTerminalTaskStatus('FAILED')).toBe(true);
            expect(isTerminalTaskStatus('Error')).toBe(true);
        });

        it('returns false for "pending"', async () => {
            const { isTerminalTaskStatus } = await loadModule();
            expect(isTerminalTaskStatus('pending')).toBe(false);
        });

        it('returns false for "running"', async () => {
            const { isTerminalTaskStatus } = await loadModule();
            expect(isTerminalTaskStatus('running')).toBe(false);
        });
    });

    describe('cacheTaskResult / getCachedTaskResult', () => {
        it('stores and retrieves results', async () => {
            const { cacheTaskResult, getCachedTaskResult } = await loadModule();
            const result = {
                taskId: 't1',
                type: 'test',
                status: 'completed',
                createdAt: new Date().toISOString(),
            };
            cacheTaskResult('t1', result as any);
            expect(getCachedTaskResult('t1')).toBe(result);
        });

        it('returns undefined for uncached task', async () => {
            const { getCachedTaskResult } = await loadModule();
            expect(getCachedTaskResult('missing')).toBeUndefined();
        });

        it('evicts oldest when exceeding 250 limit', async () => {
            const { cacheTaskResult, getCachedTaskResult } = await loadModule();
            for (let i = 0; i < 251; i++) {
                cacheTaskResult(`t${i}`, { taskId: `t${i}`, type: 'test', status: 'completed', createdAt: '' } as any);
            }
            expect(getCachedTaskResult('t0')).toBeUndefined();
            expect(getCachedTaskResult('t250')).toBeDefined();
        });
    });

    describe('createMissingTaskResult', () => {
        it('produces correct shape', async () => {
            const { createMissingTaskResult } = await loadModule();
            const error = Object.assign(new Error('test'), {
                statusCode: 500,
                userMessage: 'Server error',
            }) as any;
            const result = createMissingTaskResult('task-1', error);
            expect(result.taskId).toBe('task-1');
            expect(result.status).toBe('failed');
            expect(result.type).toBe('unknown');
            const err = result.error as { statusCode?: number; message?: string };
            expect(err.statusCode).toBe(500);
            expect(err.message).toBe('Server error');
        });

        it('falls back to error.message when userMessage missing', async () => {
            const { createMissingTaskResult } = await loadModule();
            const error = Object.assign(new Error('raw error'), {
                statusCode: 500,
            }) as any;
            const result = createMissingTaskResult('task-1', error);
            const err = result.error as { statusCode?: number; message?: string };
            expect(err.message).toBe('raw error');
        });
    });

    describe('pending task result wait lifecycle', () => {
        it('set, get, delete', async () => {
            const { setPendingTaskResultWait, getPendingTaskResultWait, deletePendingTaskResultWait } = await loadModule();
            const promise = Promise.resolve({ taskId: 't1', type: 'test', status: 'completed', createdAt: '' } as any);
            setPendingTaskResultWait('t1', promise);
            const wait = getPendingTaskResultWait('t1');
            expect(wait).toBeDefined();
            expect(wait!.promise).toBe(promise);

            deletePendingTaskResultWait('t1');
            expect(getPendingTaskResultWait('t1')).toBeUndefined();
        });

        it('returns undefined for non-existent wait', async () => {
            const { getPendingTaskResultWait } = await loadModule();
            expect(getPendingTaskResultWait('missing')).toBeUndefined();
        });
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockDiagnostics } from '../test/mocks';
import {
    isTerminalTaskStatus,
    cacheTaskResult,
    getCachedTaskResult,
    createMissingTaskResult,
    setPendingTaskResultWait,
    getPendingTaskResultWait,
    deletePendingTaskResultWait,
    resetForTesting,
} from './taskResultCache';

vi.mock('../utils/diagnostics', () => mockDiagnostics());

vi.mock('../services/eventService', () => ({
    EventService: {
        markTaskHandled: vi.fn(),
    },
}));

describe('taskResultCache', () => {
    afterEach(() => {
        resetForTesting();
    });

    describe('isTerminalTaskStatus', () => {
        it('returns true for "completed"', () => {
            expect(isTerminalTaskStatus('completed')).toBe(true);
        });

        it('returns true for "failed"', () => {
            expect(isTerminalTaskStatus('failed')).toBe(true);
        });

        it('returns true for "error"', () => {
            expect(isTerminalTaskStatus('error')).toBe(true);
        });

        it('is case-insensitive', () => {
            expect(isTerminalTaskStatus('Completed')).toBe(true);
            expect(isTerminalTaskStatus('FAILED')).toBe(true);
            expect(isTerminalTaskStatus('Error')).toBe(true);
        });

        it('returns false for "pending"', () => {
            expect(isTerminalTaskStatus('pending')).toBe(false);
        });

        it('returns false for "running"', () => {
            expect(isTerminalTaskStatus('running')).toBe(false);
        });
    });

    describe('cacheTaskResult / getCachedTaskResult', () => {
        it('stores and retrieves results', () => {
            const result = {
                taskId: 't1',
                type: 'test',
                status: 'completed',
                createdAt: new Date().toISOString(),
            };
            cacheTaskResult('t1', result as any);
            expect(getCachedTaskResult('t1')).toBe(result);
        });

        it('returns undefined for uncached task', () => {
            expect(getCachedTaskResult('missing')).toBeUndefined();
        });

        it('evicts oldest when exceeding 250 limit', () => {
            for (let i = 0; i < 251; i++) {
                cacheTaskResult(`t${i}`, { taskId: `t${i}`, type: 'test', status: 'completed', createdAt: '' } as any);
            }
            expect(getCachedTaskResult('t0')).toBeUndefined();
            expect(getCachedTaskResult('t250')).toBeDefined();
        });
    });

    describe('createMissingTaskResult', () => {
        it('produces correct shape', () => {
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

        it('falls back to error.message when userMessage missing', () => {
            const error = Object.assign(new Error('raw error'), {
                statusCode: 500,
            }) as any;
            const result = createMissingTaskResult('task-1', error);
            const err = result.error as { statusCode?: number; message?: string };
            expect(err.message).toBe('raw error');
        });
    });

    describe('pending task result wait lifecycle', () => {
        it('set, get, delete', () => {
            const promise = Promise.resolve({ taskId: 't1', type: 'test', status: 'completed', createdAt: '' } as any);
            setPendingTaskResultWait('t1', promise);
            const wait = getPendingTaskResultWait('t1');
            expect(wait).toBeDefined();
            expect(wait!.promise).toBe(promise);

            deletePendingTaskResultWait('t1');
            expect(getPendingTaskResultWait('t1')).toBeUndefined();
        });

        it('returns undefined for non-existent wait', () => {
            expect(getPendingTaskResultWait('missing')).toBeUndefined();
        });
    });
});

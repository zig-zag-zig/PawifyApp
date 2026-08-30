// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mockDiagnostics } from '../test/mocks';

vi.mock('@react-native-community/netinfo', () => ({
    fetch: vi.fn(async () => ({ isConnected: true })),
    addEventListener: vi.fn(() => vi.fn()),
}));

vi.mock('react-native', () => ({
    AppState: {
        currentState: 'active',
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
}));

vi.mock('react-native-uuid', () => ({
    default: {
        v4: vi.fn(() => 'mock-uuid-12345'),
    },
}));

vi.mock('../utils/diagnostics', () => mockDiagnostics());

import { AppState } from 'react-native';
import * as NetInfo from '@react-native-community/netinfo';
import useTaskManager from '../hooks/useTaskManager';

const mockAppState = AppState as unknown as {
    currentState: string;
    addEventListener: ReturnType<typeof vi.fn>;
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useTaskManager', () => {
    describe('addTask', () => {
        it('creates a task with correct shape', () => {
            const { result } = renderHook(() => useTaskManager());
            let task: ReturnType<typeof result.current.addTask>;

            act(() => {
                task = result.current.addTask(
                    async () => 'result',
                    'testOperation',
                    { origin: 'test-origin', replayPolicy: 'none' },
                );
            });

            expect(task!.id).toBe('mock-uuid-12345');
            expect(task!.operationName).toBe('testOperation');
            expect(task!.origin).toBe('test-origin');
            expect(task!.replayPolicy).toBe('none');
            expect(task!.result).toBeUndefined();
            expect(task!.error).toBeUndefined();
            expect(result.current.tasks).toHaveLength(1);
        });

        it('uses custom taskId when provided', () => {
            const { result } = renderHook(() => useTaskManager());
            let task: ReturnType<typeof result.current.addTask>;

            act(() => {
                task = result.current.addTask(
                    async () => 'result',
                    'testOperation',
                    { taskId: 'custom-id' },
                );
            });

            expect(task!.id).toBe('custom-id');
        });

        it('defaults replayPolicy to "none"', () => {
            const { result } = renderHook(() => useTaskManager());
            let task: ReturnType<typeof result.current.addTask>;

            act(() => {
                task = result.current.addTask(
                    async () => 'result',
                    'testOperation',
                );
            });

            expect(task!.replayPolicy).toBe('none');
        });
    });

    describe('executeTask', () => {
        it('runs task and stores result', async () => {
            const { result } = renderHook(() => useTaskManager());
            const task = result.current.addTask(
                async () => 'success',
                'testOperation',
            );

            await act(async () => {
                await result.current.executeTask(task);
            });

            const updatedTask = result.current.tasks.find(t => t.id === task.id);
            expect(updatedTask?.result).toBe('success');
            expect(updatedTask?.error).toBeUndefined();
        });

        it('stores error on failure and returns null', async () => {
            const { result } = renderHook(() => useTaskManager());
            const task = result.current.addTask(
                async () => { throw new Error('task failed'); },
                'testOperation',
            );

            let outcome: unknown;
            await act(async () => {
                outcome = await result.current.executeTask(task);
            });

            expect(outcome).toBeNull();
            const updatedTask = result.current.tasks.find(t => t.id === task.id);
            expect(updatedTask?.error).toBeInstanceOf(Error);
        });

        it('skips execution when task is already settled with result', async () => {
            const { result } = renderHook(() => useTaskManager());
            const task = result.current.addTask(
                async () => 'first',
                'testOperation',
            );

            await act(async () => {
                await result.current.executeTask(task);
            });

            const outcome = await act(async () => {
                return result.current.executeTask(task);
            });

            expect(outcome).toBe('first');
        });

        it('returns cached result when task already settled', async () => {
            const { result } = renderHook(() => useTaskManager());
            const task = result.current.addTask(
                async () => 'first',
                'testOperation',
            );

            await act(async () => {
                await result.current.executeTask(task);
            });

            // Second call returns cached result without re-running
            const outcome = await act(async () => {
                return result.current.executeTask(task);
            });

            expect(outcome).toBe('first');
        });
    });

    describe('removeTask', () => {
        it('removes task from state', async () => {
            const { result } = renderHook(() => useTaskManager());
            const task = result.current.addTask(
                async () => 'result',
                'testOperation',
            );

            act(() => {
                result.current.removeTask(task.id);
            });

            expect(result.current.tasks).toHaveLength(0);
        });
    });

    describe('removeAllTasks', () => {
        it('clears all tasks', async () => {
            const { result } = renderHook(() => useTaskManager());
            result.current.addTask(async () => 'a', 'opA');
            result.current.addTask(async () => 'b', 'opB');

            act(() => {
                result.current.removeAllTasks();
            });

            expect(result.current.tasks).toHaveLength(0);
        });
    });

    describe('deferral scenarios', () => {
        // isConnectedRef is set asynchronously via NetInfo.fetch() in a useEffect,
        // so direct testing of network deferral at the unit level is brittle.
        // These scenarios are better suited for integration/E2E tests.

        it('defers task execution when app is in background', async () => {
            mockAppState.currentState = 'background';

            const { result } = renderHook(() => useTaskManager());
            const task = result.current.addTask(
                async () => 'result',
                'testOperation',
                { replayPolicy: 'foreground' },
            );

            await act(async () => {
                const outcome = await result.current.executeTask(task);
                expect(outcome).toBeNull();
            });

            const bgTask = result.current.tasks.find(t => t.id === task.id);
            expect(bgTask?.result).toBeUndefined();
            expect(bgTask?.error).toBeUndefined();
        });
    });
});

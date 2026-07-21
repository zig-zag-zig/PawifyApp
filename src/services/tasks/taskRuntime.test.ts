// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDiagnostics } from '../../test/mocks';

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

vi.mock('../../utils/diagnostics', () => mockDiagnostics());

import * as NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { createTaskManagerStore } from './taskRuntime';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('createTaskManagerStore', () => {
    describe('addTask', () => {
        it('creates a task with correct shape', () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => 'result',
                'testOperation',
                { origin: 'test-origin', replayPolicy: 'none' },
            );

            expect(task.id).toBe('mock-uuid-12345');
            expect(task.operationName).toBe('testOperation');
            expect(task.origin).toBe('test-origin');
            expect(task.replayPolicy).toBe('none');
            expect(task.result).toBeUndefined();
            expect(task.error).toBeUndefined();
            expect(store.getState().tasks).toHaveLength(1);
            store.destroy();
        });

        it('uses custom taskId when provided', () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => 'result',
                'testOperation',
                { taskId: 'custom-id' },
            );

            expect(task.id).toBe('custom-id');
            store.destroy();
        });

        it('defaults replayPolicy to "none"', () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => 'result',
                'testOperation',
            );

            expect(task.replayPolicy).toBe('none');
            store.destroy();
        });
    });

    describe('executeTask', () => {
        it('runs task and stores result', async () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => 'success',
                'testOperation',
            );

            await store.executeTask(task);

            const updatedTask = store.getState().tasks.find(t => t.id === task.id);
            expect(updatedTask?.result).toBe('success');
            expect(updatedTask?.error).toBeUndefined();
            store.destroy();
        });

        it('stores error on failure and returns null', async () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => { throw new Error('task failed'); },
                'testOperation',
            );

            const outcome = await store.executeTask(task);

            expect(outcome).toBeNull();
            const updatedTask = store.getState().tasks.find(t => t.id === task.id);
            expect(updatedTask?.error).toBeInstanceOf(Error);
            store.destroy();
        });

        it('skips execution when task is already settled with result', async () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => 'first',
                'testOperation',
            );

            await store.executeTask(task);
            const outcome = await store.executeTask(task);

            expect(outcome).toBe('first');
            store.destroy();
        });

        it('returns cached result when task already settled', async () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => 'first',
                'testOperation',
            );

            await store.executeTask(task);

            // Second call returns cached result without re-running
            const outcome = await store.executeTask(task);

            expect(outcome).toBe('first');
            store.destroy();
        });
    });

    describe('removeTask', () => {
        it('removes task from state', async () => {
            const store = createTaskManagerStore();
            const task = store.addTask(
                async () => 'result',
                'testOperation',
            );

            store.removeTask(task.id);

            expect(store.getState().tasks).toHaveLength(0);
            store.destroy();
        });
    });

    describe('removeAllTasks', () => {
        it('clears all tasks', () => {
            const store = createTaskManagerStore();
            store.addTask(async () => 'a', 'opA');
            store.addTask(async () => 'b', 'opB');

            store.removeAllTasks();

            expect(store.getState().tasks).toHaveLength(0);
            store.destroy();
        });
    });

    describe('subscription', () => {
        it('notifies subscribers on addTask', () => {
            const store = createTaskManagerStore();
            const listener = vi.fn();
            store.subscribe(listener);

            store.addTask(async () => 'a', 'opA');

            expect(listener).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('notifies subscribers on removeTask', () => {
            const store = createTaskManagerStore();
            const task = store.addTask(async () => 'a', 'opA');
            const listener = vi.fn();
            store.subscribe(listener);

            store.removeTask(task.id);

            expect(listener).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('notifies subscribers on executeTask completion', async () => {
            const store = createTaskManagerStore();
            const task = store.addTask(async () => 'result', 'opA');
            const listener = vi.fn();
            store.subscribe(listener);

            await store.executeTask(task);

            expect(listener).toHaveBeenCalled();
            store.destroy();
        });

        it('unsubscribes correctly', () => {
            const store = createTaskManagerStore();
            const listener = vi.fn();
            const unsubscribe = store.subscribe(listener);
            unsubscribe();

            store.addTask(async () => 'a', 'opA');

            expect(listener).not.toHaveBeenCalled();
            store.destroy();
        });
    });

    describe('store isolation', () => {
        it('two stores do not share tasks', () => {
            const storeA = createTaskManagerStore();
            const storeB = createTaskManagerStore();

            storeA.addTask(async () => 'a', 'opA', { taskId: 'task-a' });
            storeB.addTask(async () => 'b', 'opB', { taskId: 'task-b' });

            expect(storeA.getState().tasks).toHaveLength(1);
            expect(storeB.getState().tasks).toHaveLength(1);
            expect(storeA.getState().tasks[0].id).toBe('task-a');
            expect(storeB.getState().tasks[0].id).toBe('task-b');

            storeA.destroy();
            storeB.destroy();
        });

        it('two stores have independent executeTask', async () => {
            const storeA = createTaskManagerStore();
            const storeB = createTaskManagerStore();

            const fnA = vi.fn(async () => 'resultA');
            const fnB = vi.fn(async () => 'resultB');

            const taskA = storeA.addTask(fnA, 'opA');
            const taskB = storeB.addTask(fnB, 'opB');

            await Promise.all([
                storeA.executeTask(taskA),
                storeB.executeTask(taskB),
            ]);

            expect(fnA).toHaveBeenCalledTimes(1);
            expect(fnB).toHaveBeenCalledTimes(1);
            expect(storeA.getState().tasks[0].result).toBe('resultA');
            expect(storeB.getState().tasks[0].result).toBe('resultB');

            storeA.destroy();
            storeB.destroy();
        });

        it('removing task from one store does not affect the other', () => {
            const storeA = createTaskManagerStore();
            const storeB = createTaskManagerStore();

            storeA.addTask(async () => 'a', 'opA');
            storeB.addTask(async () => 'b', 'opB');

            storeA.removeAllTasks();

            expect(storeA.getState().tasks).toHaveLength(0);
            expect(storeB.getState().tasks).toHaveLength(1);

            storeA.destroy();
            storeB.destroy();
        });
    });

    describe('destroy', () => {
        it('stops notifying after destroy', () => {
            const store = createTaskManagerStore();
            const listener = vi.fn();
            store.subscribe(listener);
            store.destroy();

            // Listener cleared by destroy; addTask should not trigger it
            store.addTask(async () => 'a', 'opA'); // this still mutates internal state but no listeners

            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('start / stop lifecycle', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('start attaches NetInfo listener', () => {
            const store = createTaskManagerStore();

            expect(NetInfo.addEventListener).not.toHaveBeenCalled();
            store.start();
            expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('start attaches AppState listener', () => {
            const store = createTaskManagerStore();

            expect(AppState.addEventListener).not.toHaveBeenCalled();
            store.start();
            expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
            expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
            store.destroy();
        });

        it('start is idempotent (only attaches once)', () => {
            const store = createTaskManagerStore();

            store.start();
            store.start();
            store.start();

            expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
            expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('stop detaches NetInfo listener', () => {
            const store = createTaskManagerStore();
            const netInfoUnsubscribe = vi.fn();
            vi.mocked(NetInfo.addEventListener).mockReturnValueOnce(netInfoUnsubscribe);

            store.start();
            expect(netInfoUnsubscribe).not.toHaveBeenCalled();

            store.stop();
            expect(netInfoUnsubscribe).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('stop detaches AppState listener', () => {
            const store = createTaskManagerStore();
            const appStateRemove = vi.fn();
            vi.mocked(AppState.addEventListener).mockReturnValueOnce({ remove: appStateRemove });

            store.start();
            expect(appStateRemove).not.toHaveBeenCalled();

            store.stop();
            expect(appStateRemove).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('stop is idempotent (safe to call multiple times)', () => {
            const store = createTaskManagerStore();
            const unsubscribe = vi.fn();
            vi.mocked(NetInfo.addEventListener).mockReturnValueOnce(unsubscribe);

            store.start();
            store.stop();
            store.stop();
            store.stop();

            // unsubscribe called only once (from first stop)
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('start after stop re-attaches listeners', () => {
            const store = createTaskManagerStore();

            store.start();
            store.stop();

            vi.clearAllMocks();

            store.start();

            expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
            expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
            store.destroy();
        });

        it('destroy calls stop and clears listeners', () => {
            const store = createTaskManagerStore();
            const unsubscribe = vi.fn();
            vi.mocked(NetInfo.addEventListener).mockReturnValueOnce(unsubscribe);

            store.start();
            const listener = vi.fn();
            store.subscribe(listener);

            store.destroy();

            // Listeners unsubscribed
            expect(unsubscribe).toHaveBeenCalledTimes(1);
            // React listeners cleared
            store.addTask(async () => 'a', 'opA');
            expect(listener).not.toHaveBeenCalled();
        });
    });
});

import * as NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import uuid from 'react-native-uuid';
import {
    describeError,
    describeIds,
    describeValueShape,
    diagnosticLog,
    diagnosticWarn,
    elapsedSince,
    shouldLogArtistTaskDiagnostics,
} from '../../utils/diagnostics';

type TaskRunReason = 'direct-execute' | 'appstate-replay' | 'network-replay';
type TaskReplayReason = Exclude<TaskRunReason, 'direct-execute'>;

export type TaskReplayPolicy = 'none' | 'foreground' | 'network' | 'both';

export type AddTaskOptions = {
    taskId?: string;
    origin?: string;
    replayPolicy?: TaskReplayPolicy;
};

export type QueuedTask<T = unknown> = {
    id: string;
    run: () => Promise<T>;
    operationName: string;
    origin?: string;
    createdAtIso?: string;
    result?: T;
    error?: unknown;
    deferredByNetwork?: boolean;
    replayPolicy: TaskReplayPolicy;
};

/**
 * NOTE: removeTask does NOT cancel in-flight promises.
 * The task's run() promise continues to completion; the task entry is
 * simply removed from the visible queue. Any setState/result update
 * that fires later is silently ignored because the task is gone.
 */
function shouldReplayTask(task: QueuedTask, reason: TaskReplayReason): boolean {
    switch (task.replayPolicy) {
        case 'both':
            return true;
        case 'foreground':
            return reason === 'appstate-replay';
        case 'network':
            return reason === 'network-replay';
        case 'none':
        default:
            return false;
    }
}

type StoreListener = () => void;

export interface TaskManagerStore {
    getState: () => { tasks: QueuedTask[] };
    subscribe: (listener: StoreListener) => () => void;
    addTask: <T>(
        run: () => Promise<T>,
        operationName: string,
        options?: AddTaskOptions,
    ) => QueuedTask<T>;
    executeTask: <T>(
        task: QueuedTask<T>,
        runReason?: TaskRunReason,
    ) => Promise<T | null>;
    removeTask: (taskId: string) => void;
    removeAllTasks: () => void;
    start: () => void;
    stop: () => void;
    destroy: () => void;
}

/**
 * Creates an independent task manager store instance.
 * Each store maintains its own task queue, in-flight set,
 * network state, app-state, and native listeners.
 *
 * Native listeners (NetInfo/AppState) are NOT registered at construction.
 * Call start() to attach them and stop() to detach them.
 * Call destroy() to stop + clear React listeners.
 */
export function createTaskManagerStore(): TaskManagerStore {
    let tasks: QueuedTask[] = [];
    const inFlightTaskIds = new Set<string>();
    let isConnected: boolean | null = null;
    let appState: string = AppState.currentState;
    const listeners = new Set<StoreListener>();
    let started = false;

    let netInfoUnsubscribe: (() => void) | null = null;
    let appStateSubscription: { remove: () => void } | null = null;

    function notifyListeners() {
        for (const listener of listeners) {
            listener();
        }
    }

    function getState() {
        return { tasks };
    }

    function subscribe(listener: StoreListener): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    // --- NetInfo + AppState listener lifecycle (start/stop) ---

    function start(): void {
        if (started) {
            return;
        }
        started = true;

        NetInfo.fetch().then(state => {
            isConnected = state.isConnected;
        });

        netInfoUnsubscribe = NetInfo.addEventListener(state => {
            isConnected = state.isConnected;
            if (state.isConnected) {
                const replayableTaskIds = new Set<string>();
                for (const task of tasks) {
                    const shouldReplay =
                        task.deferredByNetwork &&
                        task.result === undefined &&
                        task.error === undefined &&
                        shouldReplayTask(task, 'network-replay');

                    if (!shouldReplay) {
                        continue;
                    }

                    replayableTaskIds.add(task.id);
                    void executeTaskInternal(task, 'network-replay');
                }

                if (replayableTaskIds.size > 0) {
                    const diagnosticTaskIds = tasks
                        .filter(
                            task =>
                                replayableTaskIds.has(task.id) &&
                                shouldLogArtistTaskDiagnostics(task.operationName, task.origin),
                        )
                        .map(task => task.id);
                    if (diagnosticTaskIds.length > 0) {
                        diagnosticLog('task-manager', 'network-replay-batch', {
                            taskIds: describeIds(diagnosticTaskIds),
                        });
                    }
                    tasks = tasks.map(task =>
                        replayableTaskIds.has(task.id)
                            ? { ...task, deferredByNetwork: false }
                            : task,
                    );
                    notifyListeners();
                }
            }
        });

        const handleAppStateChange = (nextAppState: string) => {
            appState = nextAppState;
            if (nextAppState === 'active') {
                const replayableTaskIds: string[] = [];
                for (const task of tasks) {
                    const shouldReplay =
                        !task.deferredByNetwork &&
                        task.result === undefined &&
                        task.error === undefined &&
                        shouldReplayTask(task, 'appstate-replay');

                    if (!shouldReplay) {
                        continue;
                    }

                    replayableTaskIds.push(task.id);
                    void executeTaskInternal(task, 'appstate-replay');
                }

                const diagnosticTaskIds = tasks
                    .filter(
                        task =>
                            replayableTaskIds.includes(task.id) &&
                            shouldLogArtistTaskDiagnostics(task.operationName, task.origin),
                    )
                    .map(task => task.id);
                if (diagnosticTaskIds.length > 0) {
                    diagnosticLog('task-manager', 'appstate-replay-batch', {
                        taskIds: describeIds(diagnosticTaskIds),
                    });
                }
            }
        };

        appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    }

    function stop(): void {
        if (!started) {
            return;
        }
        started = false;

        if (netInfoUnsubscribe) {
            netInfoUnsubscribe();
            netInfoUnsubscribe = null;
        }
        if (appStateSubscription) {
            appStateSubscription.remove();
            appStateSubscription = null;
        }
    }

    // --- Public API ---

    function addTask<T>(
        run: () => Promise<T>,
        operationName: string,
        options?: AddTaskOptions,
    ): QueuedTask<T> {
        const taskId = options?.taskId;
        const origin = options?.origin;
        const replayPolicy = options?.replayPolicy ?? 'none';
        const resolvedTaskId = (taskId ?? uuid.v4()) as string;
        const newTask: QueuedTask<T> = {
            id: resolvedTaskId,
            run,
            operationName,
            origin,
            createdAtIso: new Date().toISOString(),
            replayPolicy,
        };
        if (shouldLogArtistTaskDiagnostics(operationName, origin)) {
            diagnosticLog('task-manager', 'task-added', {
                taskId: newTask.id,
                operationName,
                origin,
                replayPolicy,
            });
        }
        tasks = [...tasks, newTask];
        notifyListeners();
        return newTask;
    }

    async function executeTaskInternal<T>(
        task: QueuedTask<T>,
        runReason: TaskRunReason = 'direct-execute',
    ): Promise<T | null> {
        const isNetworkDisconnected = () => isConnected === false;
        const shouldLogDiagnostics = shouldLogArtistTaskDiagnostics(
            task.operationName,
            task.origin,
        );

        const existingTask = tasks.find(t => t.id === task.id);
        if (
            existingTask &&
            (existingTask.result !== undefined || existingTask.error !== undefined)
        ) {
            if (shouldLogDiagnostics) {
                diagnosticLog('task-manager', 'execute-skipped-settled', {
                    taskId: task.id,
                    operationName: task.operationName,
                    origin: task.origin,
                    hasResult: existingTask.result !== undefined,
                    hasError: existingTask.error !== undefined,
                });
            }
            return (existingTask.result as T | undefined) ?? null;
        }

        if (inFlightTaskIds.has(task.id)) {
            if (shouldLogDiagnostics) {
                diagnosticLog('task-manager', 'execute-skipped-in-flight', {
                    taskId: task.id,
                    operationName: task.operationName,
                    origin: task.origin,
                });
            }
            return null;
        }

        if (isNetworkDisconnected()) {
            if (shouldLogDiagnostics) {
                diagnosticWarn('task-manager', 'execute-delayed-network', {
                    taskId: task.id,
                    operationName: task.operationName,
                    origin: task.origin,
                    runReason,
                });
            }
            tasks = tasks.map(t =>
                t.id === task.id ? { ...t, deferredByNetwork: true } : t,
            );
            notifyListeners();
            return null;
        }

        if (appState !== 'active') {
            if (shouldLogDiagnostics) {
                diagnosticWarn('task-manager', 'execute-delayed-app-state', {
                    taskId: task.id,
                    operationName: task.operationName,
                    origin: task.origin,
                    runReason,
                    appState,
                });
            }
            return null;
        }

        inFlightTaskIds.add(task.id);
        const taskStartedAt = Date.now();
        if (shouldLogDiagnostics) {
            diagnosticLog('task-manager', 'execute-start', {
                taskId: task.id,
                operationName: task.operationName,
                origin: task.origin,
                runReason,
                replayPolicy: task.replayPolicy,
            });
        }
        try {
            const result = await task.run();
            if (shouldLogDiagnostics) {
                diagnosticLog('task-manager', 'execute-done', {
                    taskId: task.id,
                    operationName: task.operationName,
                    origin: task.origin,
                    runReason,
                    elapsedMs: elapsedSince(taskStartedAt),
                    resultShape: describeValueShape(result),
                });
            }
            tasks = tasks.map(t =>
                t.id === task.id
                    ? { ...t, result, error: undefined, deferredByNetwork: false }
                    : t,
            );
            notifyListeners();
            return result;
        } catch (error) {
            if (isNetworkDisconnected()) {
                if (shouldLogDiagnostics) {
                    diagnosticWarn('task-manager', 'execute-failed-network', {
                        taskId: task.id,
                        operationName: task.operationName,
                        origin: task.origin,
                        runReason,
                        elapsedMs: elapsedSince(taskStartedAt),
                        error: describeError(error),
                    });
                }
                tasks = tasks.map(t =>
                    t.id === task.id ? { ...t, deferredByNetwork: true } : t,
                );
                notifyListeners();
            } else if (appState === 'active') {
                console.error('task-manager: execute task failed', {
                    taskId: task.id,
                    operationName: task.operationName,
                    origin: task.origin,
                    runReason,
                    error,
                });
                if (shouldLogDiagnostics) {
                    diagnosticWarn('task-manager', 'execute-failed', {
                        taskId: task.id,
                        operationName: task.operationName,
                        origin: task.origin,
                        runReason,
                        elapsedMs: elapsedSince(taskStartedAt),
                        error: describeError(error),
                    });
                }
                tasks = tasks.map(t =>
                    t.id === task.id ? { ...t, error } : t,
                );
                notifyListeners();
            }
            return null;
        } finally {
            inFlightTaskIds.delete(task.id);
        }
    }

    function removeTask(taskId: string) {
        const existingTask = tasks.find(task => task.id === taskId);
        if (
            existingTask &&
            shouldLogArtistTaskDiagnostics(existingTask.operationName, existingTask.origin)
        ) {
            diagnosticLog('task-manager', 'task-removed', {
                taskId,
                operationName: existingTask.operationName,
                origin: existingTask.origin,
                hadResult: existingTask.result !== undefined,
                hadError: existingTask.error !== undefined,
            });
        }
        tasks = tasks.filter(task => task.id !== taskId);
        notifyListeners();
    }

    function removeAllTasks() {
        const diagnosticTasks = tasks.filter(task =>
            shouldLogArtistTaskDiagnostics(task.operationName, task.origin),
        );
        if (diagnosticTasks.length > 0) {
            diagnosticLog('task-manager', 'remove-all', {
                taskIds: describeIds(diagnosticTasks.map(task => task.id)),
                count: diagnosticTasks.length,
            });
        }
        tasks = [];
        notifyListeners();
    }

    function destroy() {
        stop();
        listeners.clear();
    }

    return {
        getState,
        subscribe,
        addTask,
        executeTask: executeTaskInternal,
        removeTask,
        removeAllTasks,
        start,
        stop,
        destroy,
    };
}

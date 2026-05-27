import * as NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '../utils/diagnostics';

type TaskRunReason = 'direct-execute' | 'appstate-replay' | 'network-replay';
type TaskReplayReason = Exclude<TaskRunReason, 'direct-execute'>;
export type TaskReplayPolicy = 'none' | 'foreground' | 'network' | 'both';

type AddTaskOptions = {
    taskId?: string;
    origin?: string;
    replayPolicy?: TaskReplayPolicy;
};

export type Task<T = any> = {
    id: string;
    method: () => Promise<T>;
    methodName: string;
    origin?: string;
    createdAtIso?: string;
    result?: T;
    error?: any;
    skippedDueToNetwork?: boolean;
    replayPolicy: TaskReplayPolicy;
};

const shouldReplayTask = (task: Task, reason: TaskReplayReason): boolean => {
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
};

const useTaskManager = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const tasksRef = useRef<Task[]>([]);
    const inFlightTaskIdsRef = useRef<Set<string>>(new Set());
    const isConnectedRef = useRef<boolean | null>(null);
    const appStateRef = useRef<string>(AppState.currentState);

    const executeTask = useCallback(async <T,>(
        task: Task<T>,
        runReason: TaskRunReason = 'direct-execute'
    ): Promise<T | null> => {
        const isNetworkDisconnected = () => isConnectedRef.current === false;
        const shouldLogDiagnostics = shouldLogArtistTaskDiagnostics(task.methodName, task.origin);

        const existingTask = tasksRef.current.find((t) => t.id === task.id);
        if (existingTask && (existingTask.result !== undefined || existingTask.error !== undefined)) {
            if (shouldLogDiagnostics) {
                diagnosticLog('task-manager', 'execute-skipped-settled', {
                    taskId: task.id,
                    methodName: task.methodName,
                    origin: task.origin,
                    hasResult: existingTask.result !== undefined,
                    hasError: existingTask.error !== undefined,
                });
            }
            return (existingTask.result as T | undefined) ?? null;
        }

        if (inFlightTaskIdsRef.current.has(task.id)) {
            if (shouldLogDiagnostics) {
                diagnosticLog('task-manager', 'execute-skipped-in-flight', {
                    taskId: task.id,
                    methodName: task.methodName,
                    origin: task.origin,
                });
            }
            return null;
        }

        if (isNetworkDisconnected()) {
            if (shouldLogDiagnostics) {
                diagnosticWarn('task-manager', 'execute-delayed-network', {
                    taskId: task.id,
                    methodName: task.methodName,
                    origin: task.origin,
                    runReason,
                });
            }
            setTasks((prevTasks) =>
                prevTasks.map((t) =>
                    t.id === task.id ? { ...t, skippedDueToNetwork: true } : t
                )
            );
            return null;
        }

        if (appStateRef.current !== 'active') {
            if (shouldLogDiagnostics) {
                diagnosticWarn('task-manager', 'execute-delayed-app-state', {
                    taskId: task.id,
                    methodName: task.methodName,
                    origin: task.origin,
                    runReason,
                    appState: appStateRef.current,
                });
            }
            return null;
        }

        inFlightTaskIdsRef.current.add(task.id);
        const taskStartedAt = Date.now();
        if (shouldLogDiagnostics) {
            diagnosticLog('task-manager', 'execute-start', {
                taskId: task.id,
                methodName: task.methodName,
                origin: task.origin,
                runReason,
                replayPolicy: task.replayPolicy,
            });
        }
        try {
            const result = await task.method();
            if (shouldLogDiagnostics) {
                diagnosticLog('task-manager', 'execute-done', {
                    taskId: task.id,
                    methodName: task.methodName,
                    origin: task.origin,
                    runReason,
                    elapsedMs: elapsedSince(taskStartedAt),
                    resultShape: describeValueShape(result),
                });
            }
            setTasks((prevTasks) =>
                prevTasks.map((t) =>
                    t.id === task.id ? { ...t, result, error: undefined, skippedDueToNetwork: false } : t
                )
            );
            return result;
        } catch (error) {
            if (isNetworkDisconnected()) {
                if (shouldLogDiagnostics) {
                    diagnosticWarn('task-manager', 'execute-failed-network', {
                        taskId: task.id,
                        methodName: task.methodName,
                        origin: task.origin,
                        runReason,
                        elapsedMs: elapsedSince(taskStartedAt),
                        error: describeError(error),
                    });
                }
                setTasks((prevTasks) =>
                    prevTasks.map((t) =>
                        t.id === task.id ? { ...t, skippedDueToNetwork: true } : t
                    )
                );
            } else if (appStateRef.current === 'active') {
                console.error('task-manager: execute task failed', {
                    taskId: task.id,
                    methodName: task.methodName,
                    origin: task.origin,
                    runReason,
                    error,
                });
                if (shouldLogDiagnostics) {
                    diagnosticWarn('task-manager', 'execute-failed', {
                        taskId: task.id,
                        methodName: task.methodName,
                        origin: task.origin,
                        runReason,
                        elapsedMs: elapsedSince(taskStartedAt),
                        error: describeError(error),
                    });
                }
                setTasks((prevTasks) =>
                    prevTasks.map((t) =>
                        t.id === task.id ? { ...t, error } : t
                    )
                );
            }
            return null;
        } finally {
            inFlightTaskIdsRef.current.delete(task.id);
        }
    }, []);

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    useEffect(() => {
        NetInfo.fetch().then(state => {
            isConnectedRef.current = state.isConnected;
        });

        const unsubscribe = NetInfo.addEventListener(state => {
            isConnectedRef.current = state.isConnected;
            if (state.isConnected) {
                const replayableTaskIds = new Set<string>();
                for (const task of tasksRef.current) {
                    const shouldReplay =
                        task.skippedDueToNetwork &&
                        task.result === undefined &&
                        task.error === undefined &&
                        shouldReplayTask(task, 'network-replay');

                    if (!shouldReplay) {
                        continue;
                    }

                    replayableTaskIds.add(task.id);
                    void executeTask(task, 'network-replay');
                }

                if (replayableTaskIds.size > 0) {
                    const diagnosticTaskIds = tasksRef.current
                        .filter(task =>
                            replayableTaskIds.has(task.id) &&
                            shouldLogArtistTaskDiagnostics(task.methodName, task.origin)
                        )
                        .map(task => task.id);
                    if (diagnosticTaskIds.length > 0) {
                        diagnosticLog('task-manager', 'network-replay-batch', {
                            taskIds: describeIds(diagnosticTaskIds),
                        });
                    }
                    setTasks((prevTasks) =>
                        prevTasks.map((task) =>
                            replayableTaskIds.has(task.id)
                                ? { ...task, skippedDueToNetwork: false }
                                : task
                        )
                    );
                }
            }
        });

        return () => unsubscribe();
    }, [executeTask]);

    useEffect(() => {
        const handleAppStateChange = (nextAppState: string) => {
            appStateRef.current = nextAppState;
            if (nextAppState === 'active') {
                const replayableTaskIds: string[] = [];
                for (const task of tasksRef.current) {
                    const shouldReplay =
                        !task.skippedDueToNetwork &&
                        task.result === undefined &&
                        task.error === undefined &&
                        shouldReplayTask(task, 'appstate-replay');

                    if (!shouldReplay) {
                        continue;
                    }

                    replayableTaskIds.push(task.id);
                    void executeTask(task, 'appstate-replay');
                }

                const diagnosticTaskIds = tasksRef.current
                    .filter(task =>
                        replayableTaskIds.includes(task.id) &&
                        shouldLogArtistTaskDiagnostics(task.methodName, task.origin)
                    )
                    .map(task => task.id);
                if (diagnosticTaskIds.length > 0) {
                    diagnosticLog('task-manager', 'appstate-replay-batch', {
                        taskIds: describeIds(diagnosticTaskIds),
                    });
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
        };
    }, [executeTask]);

    const addTask = useCallback(<T,>(
        method: () => Promise<T>,
        methodName: string,
        options?: AddTaskOptions
    ): Task<T> => {
        const taskId = options?.taskId;
        const origin = options?.origin;
        const replayPolicy = options?.replayPolicy ?? 'none';
        const resolvedTaskId = (taskId ?? uuid.v4()) as string;
        const newTask: Task<T> = {
            id: resolvedTaskId,
            method,
            methodName,
            origin,
            createdAtIso: new Date().toISOString(),
            replayPolicy,
        };
        if (shouldLogArtistTaskDiagnostics(methodName, origin)) {
            diagnosticLog('task-manager', 'task-added', {
                taskId: newTask.id,
                methodName,
                origin,
                replayPolicy,
            });
        }
        setTasks((prevTasks) => [...prevTasks, newTask]);
        return newTask;
    }, []);

    const removeTask = useCallback((taskId: string) => {
        const existingTask = tasksRef.current.find(task => task.id === taskId);
        if (existingTask && shouldLogArtistTaskDiagnostics(existingTask.methodName, existingTask.origin)) {
            diagnosticLog('task-manager', 'task-removed', {
                taskId,
                methodName: existingTask.methodName,
                origin: existingTask.origin,
                hadResult: existingTask.result !== undefined,
                hadError: existingTask.error !== undefined,
            });
        }
        setTasks((prevTasks) => prevTasks.filter((task) => task.id !== taskId));
    }, []);

    const removeAllTasks = useCallback(() => {
        const diagnosticTasks = tasksRef.current.filter(task =>
            shouldLogArtistTaskDiagnostics(task.methodName, task.origin)
        );
        if (diagnosticTasks.length > 0) {
            diagnosticLog('task-manager', 'remove-all', {
                taskIds: describeIds(diagnosticTasks.map(task => task.id)),
                count: diagnosticTasks.length,
            });
        }
        setTasks([]);
    }, []);

    return useMemo(() => ({
        tasks,
        addTask,
        removeTask,
        executeTask,
        removeAllTasks,
    }), [addTask, executeTask, removeAllTasks, removeTask, tasks]);
};

export default useTaskManager;

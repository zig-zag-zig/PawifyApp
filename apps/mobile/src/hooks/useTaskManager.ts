import { useEffect, useMemo, useRef, useState } from 'react';
import { createTaskManagerStore } from '../services/tasks/taskRuntime';
import type {
    AddTaskOptions,
    QueuedTask,
    TaskManagerStore,
    TaskReplayPolicy,
} from '../services/tasks/taskRuntime';

/**
 * Thin React adapter over the framework-neutral TaskManagerStore.
 *
 * Each call to useTaskManager() creates an independent store instance
 * with its own task queue, in-flight set, NetInfo listener, and
 * AppState listener — preserving the same isolation as before.
 *
 * NOTE: removeTask does NOT cancel in-flight promises. The task entry
 * is removed from the visible queue, but the run() promise continues.
 */
const useTaskManager = () => {
    const storeRef = useRef<TaskManagerStore | null>(null);
    if (!storeRef.current) {
        storeRef.current = createTaskManagerStore();
    }
    const store = storeRef.current;

    const [tasks, setTasks] = useState<QueuedTask[]>(() => store.getState().tasks);

    useEffect(() => {
        store.start();
        const unsubscribe = store.subscribe(() => {
            setTasks(store.getState().tasks);
        });
        return () => {
            unsubscribe();
            store.stop();
        };
    }, [store]);

    return useMemo(
        () => ({
            tasks,
            addTask: store.addTask,
            removeTask: store.removeTask,
            executeTask: store.executeTask,
            removeAllTasks: store.removeAllTasks,
        }),
        [store, tasks],
    );
};

export default useTaskManager;

// Re-export types for consumer imports (artist hooks, taskUtils, etc.)
export type { QueuedTask, TaskReplayPolicy, AddTaskOptions };

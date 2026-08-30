import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    createTaskManagerStore,
    type AddTaskOptions,
    type QueuedTask,
    type TaskManagerStore,
} from '../../services/tasks/taskRuntime';

/**
 * One shared task store for all cached-image downloads. A screen with N
 * images previously created N task managers (each with its own NetInfo +
 * AppState listeners); this provider gives them a single queue. Tasks are
 * keyed by cache key, so duplicate URLs dedupe to a single download whose
 * result every watcher adopts.
 */
const ImageTaskContext = createContext<TaskManagerStore | null>(null);

export const ImageTaskProvider = ({ children }: { children: React.ReactNode }) => {
    const storeRef = useRef<TaskManagerStore | null>(null);
    if (!storeRef.current) {
        storeRef.current = createTaskManagerStore();
    }
    const store = storeRef.current;

    useEffect(() => {
        store.start();
        return () => {
            store.destroy();
        };
    }, [store]);

    return (
        <ImageTaskContext.Provider value={store}>
            {children}
        </ImageTaskContext.Provider>
    );
};

/**
 * `useTaskManager` equivalent over the shared image store. `addTask` dedupes
 * by `options.taskId`: a second request for the same cache key reuses the
 * existing (settled or in-flight) task instead of queueing a duplicate.
 */
export function useImageTaskManager() {
    const store = useContext(ImageTaskContext);
    if (!store) {
        throw new Error('useImageTaskManager must be used within an ImageTaskProvider');
    }

    const [tasks, setTasks] = useState<QueuedTask[]>(() => store.getState().tasks);

    useEffect(
        () => store.subscribe(() => setTasks(store.getState().tasks)),
        [store],
    );

    return useMemo(() => ({
        tasks,
        addTask: <T,>(
            run: () => Promise<T>,
            operationName: string,
            options?: AddTaskOptions,
        ): QueuedTask<T> => {
            const taskId = options?.taskId;
            if (taskId) {
                const existing = store.getState().tasks.find(task => task.id === taskId);
                if (existing && existing.result === undefined && existing.error === undefined) {
                    return existing as QueuedTask<T>;
                }
            }
            return store.addTask<T>(run, operationName, options);
        },
        removeTask: store.removeTask,
        executeTask: store.executeTask,
    }), [store, tasks]);
}

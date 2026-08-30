import { randomUUID } from 'crypto';
import type { Logger } from '../../common/logging/logger.js';
import { getRequestContext, runWithRequestContext } from '../../common/logging/requestContext.js';
import type {
    BackgroundTaskResultPayload,
    BackgroundTaskType,
    CompositeTaskSessionController,
    TaskSessionController,
} from '../../utils/types/taskTypes.js';
import { BackgroundTaskRegistry, type TaskLookupResult } from './backgroundTaskRegistry.js';
import { createTaskJobProcessor } from './taskJobProcessor.js';
import { BackgroundTaskQueue } from './taskQueue.js';
import { toTaskRequestContext } from './taskContext.js';
import {
    completeTaskSessionWithoutPages,
    expireOrphanedPendingTask,
    maybeCompleteTaskSession,
} from './taskSessionLifecycle.js';

export type BackgroundTaskRuntimeOptions = {
    cleanupIntervalMs: number;
    logger: Logger;
    maxConcurrency: number;
    pendingOrphanTtlMs: number;
    resultRetentionMs: number;
    workerTimeoutMs: number;
};

type CreateTaskSessionOptions<T extends BackgroundTaskResultPayload> = {
    dedupeKey?: string;
    initialResult?: T;
    isCompositeParent?: boolean;
    notifyOnCompletion?: boolean;
    parentTaskId?: string;
};

export class BackgroundTaskRuntime {
    private readonly registry: BackgroundTaskRegistry;
    private readonly queue: BackgroundTaskQueue;
    private cleanupTimer: ReturnType<typeof setInterval> | undefined;

    constructor(private readonly options: BackgroundTaskRuntimeOptions) {
        this.registry = new BackgroundTaskRegistry(options.resultRetentionMs, options.logger);
        const processPendingJob = createTaskJobProcessor({
            logger: options.logger,
            registry: this.registry,
            workerTimeoutMs: options.workerTimeoutMs,
            onSessionMaybeComplete: (taskId) => this.maybeCompleteSession(taskId),
        });

        this.queue = new BackgroundTaskQueue(options.maxConcurrency, processPendingJob);
    }

    startCleanup(): void {
        if (this.cleanupTimer) {
            return;
        }

        this.cleanupTimer = setInterval(
            () => this.cleanupExpiredTasks(),
            this.options.cleanupIntervalMs,
        );
        this.cleanupTimer.unref?.();
    }

    createBackgroundTaskSession<T extends BackgroundTaskResultPayload>(
        userId: string,
        type: BackgroundTaskType,
        options?: CreateTaskSessionOptions<T>,
    ): TaskSessionController<T> & { reused: boolean } {
        const createdSession = this.createTaskSessionRecord(userId, type, options);

        if (createdSession.reused) {
            return {
                taskId: createdSession.taskId,
                reused: true,
                submitPage: () => {},
                finalize: () => {},
            };
        }

        const taskId = createdSession.taskId;

        return {
            taskId,
            reused: false,
            submitPage: (worker) => {
                const session = this.registry.getSession(taskId);
                if (!session) {
                    return;
                }

                const queuedAt = Date.now();
                session.pagesReceived += 1;
                const pageNumber = session.pagesReceived;
                session.lastActivityAt = queuedAt;

                this.queue.enqueue({
                    taskId,
                    pageNumber,
                    queuedAt,
                    worker: async (signal) =>
                        (await worker(signal)) as Partial<BackgroundTaskResultPayload> | void,
                });

                runWithRequestContext(session.requestContext, () => {
                    this.options.logger.debug('background task page queued', {
                        pageNumber,
                        pagesReceived: session.pagesReceived,
                        pendingQueueSize: this.queue.pendingQueueSize,
                        activeTaskCount: this.queue.activeTaskCount,
                    });
                });
            },
            finalize: () => this.finalizeTaskSession(taskId),
        };
    }

    createCompositeBackgroundTaskSession<T extends BackgroundTaskResultPayload>(
        userId: string,
        type: BackgroundTaskType,
        options?: {
            dedupeKey?: string;
            initialResult?: T;
        },
    ): CompositeTaskSessionController<T> & { reused: boolean } {
        const createdSession = this.createTaskSessionRecord(userId, type, {
            ...options,
            isCompositeParent: true,
        });

        if (createdSession.reused) {
            return {
                taskId: createdSession.taskId,
                reused: true,
                submitSubtask: () => null,
                finalize: () => {},
            };
        }

        const taskId = createdSession.taskId;

        return {
            taskId,
            reused: false,
            submitSubtask: (submitPages) => {
                const parentSession = this.registry.getSession(taskId);
                const parentTask = this.registry.getTask(taskId);
                if (!parentSession || !parentTask) {
                    return null;
                }

                const childSession = this.createBackgroundTaskSession<T>(userId, type, {
                    initialResult: options?.initialResult,
                    notifyOnCompletion: false,
                    parentTaskId: taskId,
                });
                const queuedAt = Date.now();
                parentSession.pagesReceived += 1;
                parentSession.lastActivityAt = queuedAt;
                parentTask.subtaskIds = [...(parentTask.subtaskIds ?? []), childSession.taskId];
                parentTask.subtaskCount = parentSession.pagesReceived;
                parentTask.completedSubtaskCount = parentSession.tasksHandled;

                runWithRequestContext(parentSession.requestContext, () => {
                    this.options.logger.debug('background subtask queued', {
                        subtaskId: childSession.taskId,
                        subtaskCount: parentTask.subtaskCount,
                    });
                });

                try {
                    submitPages(childSession);
                } finally {
                    childSession.finalize();
                }

                return childSession.taskId;
            },
            finalize: () => this.finalizeTaskSession(taskId),
        };
    }

    getTaskResultForUser(userId: string, taskId: string): TaskLookupResult {
        this.cleanupExpiredTasks();

        const lookup = this.registry.getTaskResultForUser(userId, taskId);
        if (lookup.status === 'missing') {
            this.options.logger.debug('task result lookup missing', {
                taskId,
                userId,
                pendingQueueSize: this.queue.pendingQueueSize,
                activeTaskCount: this.queue.activeTaskCount,
            });
            return { status: 'missing' };
        }

        if (lookup.status === 'forbidden') {
            const task = this.registry.getTask(taskId);
            this.options.logger.warn('task result lookup forbidden', {
                taskId,
                userId,
                taskType: task?.type,
                taskStatus: task?.status,
            });
            return { status: 'forbidden' };
        }

        if (lookup.status === 'pending') {
            const task = lookup.task;
            this.options.logger.debug('task result lookup pending', {
                taskId,
                taskType: task.type,
                ageMs: Date.now() - task.createdAt,
            });
            return {
                status: 'pending',
                task,
            };
        }

        const task = lookup.task;
        this.options.logger.debug('task result lookup finished', {
            taskId,
            taskType: task.type,
            taskStatus: task.status,
            ageMs: (task.completedAt ?? Date.now()) - task.createdAt,
        });

        return {
            status: 'finished',
            task,
        };
    }

    addTaskUser(taskId: string, userId: string): void {
        const result = this.registry.addTaskUser(taskId, userId);
        if (!result?.added) {
            return;
        }

        this.options.logger.debug('background task user linked', {
            taskId,
            taskType: result.task.type,
            userCount: result.task.userIds.length,
            linkedUserId: userId,
        });
    }

    private createTaskSessionRecord<T extends BackgroundTaskResultPayload>(
        userId: string,
        type: BackgroundTaskType,
        options?: CreateTaskSessionOptions<T>,
    ): { taskId: string; reused: boolean } {
        this.cleanupExpiredTasks();
        const requestContext = getRequestContext();

        const dedupeKey = options?.dedupeKey?.trim();
        if (dedupeKey) {
            const existingTaskId = this.registry.resolveDedupeTask(userId, dedupeKey);
            if (existingTaskId) {
                const existingTask = this.registry.getTask(existingTaskId);
                const existingSession = this.registry.getSession(existingTaskId);
                const existingContext = toTaskRequestContext(
                    existingSession?.requestContext,
                    existingTaskId,
                    existingTask?.type ?? type,
                    userId,
                );

                runWithRequestContext(existingContext, () => {
                    this.options.logger.debug('background task dedupe reused', {
                        dedupeKey,
                        status: existingTask?.status ?? 'unknown',
                        ageMs: existingTask ? Date.now() - existingTask.createdAt : undefined,
                    });
                });

                return {
                    taskId: existingTaskId,
                    reused: true,
                };
            }
        }

        const taskId = randomUUID();
        const createdAt = Date.now();
        const taskRequestContext = toTaskRequestContext(requestContext, taskId, type, userId);

        this.registry.setTask(taskId, {
            id: taskId,
            userIds: [userId],
            type,
            status: 'pending',
            createdAt,
            result: options?.initialResult,
            parentTaskId: options?.parentTaskId,
            subtaskIds: options?.isCompositeParent ? [] : undefined,
            completedSubtaskIds: options?.isCompositeParent ? [] : undefined,
            subtaskCount: options?.isCompositeParent ? 0 : undefined,
            completedSubtaskCount: options?.isCompositeParent ? 0 : undefined,
            notifyOnCompletion: options?.notifyOnCompletion,
        });

        this.registry.setSession(taskId, {
            totalPages: 0,
            pagesReceived: 0,
            tasksHandled: 0,
            activeWorkers: 0,
            lastActivityAt: createdAt,
            failed: false,
            dedupeKey,
            requestContext: taskRequestContext,
            isCompositeParent: options?.isCompositeParent,
        });

        if (dedupeKey) {
            this.registry.setActiveDedupeTask(dedupeKey, taskId);
        }

        runWithRequestContext(taskRequestContext, () => {
            this.options.logger.debug('background task created', {
                dedupeKey,
                parentTaskId: options?.parentTaskId,
                isCompositeParent: options?.isCompositeParent ?? false,
                notifyOnCompletion: options?.notifyOnCompletion ?? true,
                initialPendingQueueSize: this.queue.pendingQueueSize,
                initialResultProvided: options?.initialResult !== undefined,
            });
        });

        return {
            taskId,
            reused: false,
        };
    }

    private finalizeTaskSession(taskId: string): void {
        const session = this.registry.getSession(taskId);
        const task = this.registry.getTask(taskId);

        if (!session || !task) {
            return;
        }

        session.totalPages = session.pagesReceived;
        session.lastActivityAt = Date.now();

        if (session.isCompositeParent) {
            task.subtaskCount = session.totalPages;
            task.completedSubtaskCount = session.tasksHandled;
        }

        if (session.totalPages === 0) {
            completeTaskSessionWithoutPages({
                logger: this.options.logger,
                registry: this.registry,
                session,
                task,
                taskId,
            });
            return;
        }

        runWithRequestContext(session.requestContext, () => {
            this.options.logger.debug('background task finalized and waiting for pages', {
                pageCount: session.totalPages,
                pagesHandled: session.tasksHandled,
                isCompositeParent: session.isCompositeParent ?? false,
            });
        });

        this.maybeCompleteSession(taskId);
    }

    private maybeCompleteSession(taskId: string): void {
        maybeCompleteTaskSession({
            logger: this.options.logger,
            registry: this.registry,
            taskId,
        });
    }

    private cleanupExpiredTasks(): void {
        const now = Date.now();

        this.registry.deleteExpiredRecentDedupeTasks(now);

        for (const [taskId, task] of this.registry.taskEntries()) {
            if (task.status === 'pending') {
                const session = this.registry.getSession(taskId);
                if (session?.activeWorkers && session.activeWorkers > 0) {
                    continue;
                }

                if (session?.isCompositeParent && this.hasPendingSubtasks(taskId)) {
                    continue;
                }

                const lastActivityAt = session?.lastActivityAt ?? task.createdAt;
                const inactiveForMs = now - lastActivityAt;
                if (inactiveForMs > this.options.pendingOrphanTtlMs) {
                    expireOrphanedPendingTask({
                        inactiveForMs,
                        logger: this.options.logger,
                        orphanTtlMs: this.options.pendingOrphanTtlMs,
                        queue: this.queue,
                        registry: this.registry,
                        session,
                        task,
                        taskId,
                    });
                }

                continue;
            }

            const completedAt = this.getTaskRetentionCompletedAt(
                taskId,
                task.completedAt ?? task.createdAt,
                now,
            );
            if (now - completedAt > this.options.resultRetentionMs) {
                this.registry.deleteTask(taskId);
            }
        }
    }

    private hasPendingSubtasks(taskId: string): boolean {
        const task = this.registry.getTask(taskId);
        return (task?.subtaskIds ?? []).some(
            (subtaskId) => this.registry.getTask(subtaskId)?.status === 'pending',
        );
    }

    private getTaskRetentionCompletedAt(taskId: string, completedAt: number, now: number): number {
        const task = this.registry.getTask(taskId);
        if (!task?.parentTaskId) {
            return completedAt;
        }

        const parentTask = this.registry.getTask(task.parentTaskId);
        if (parentTask?.status === 'pending') {
            return now;
        }

        return parentTask?.completedAt ?? completedAt;
    }
}

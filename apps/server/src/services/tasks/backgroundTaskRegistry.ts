import type { Logger } from '../../common/logging/logger.js';
import type { RequestLogContext } from '../../common/logging/requestContext.js';
import type {
    BackgroundTaskRecord,
    BackgroundTaskResultPayload,
    TaskResultResponse,
} from '../../utils/types/taskTypes.js';
import { hasUndefinedValue, toTaskResponse } from './taskResultSerialization.js';

export type TaskLookupResult =
    | { status: 'missing' }
    | { status: 'forbidden' }
    | { status: 'pending'; task: TaskResultResponse<BackgroundTaskResultPayload> }
    | { status: 'finished'; task: TaskResultResponse<BackgroundTaskResultPayload> };

export type TaskSessionState = {
    totalPages: number;
    pagesReceived: number;
    tasksHandled: number;
    activeWorkers: number;
    lastActivityAt: number;
    failed: boolean;
    error?: string;
    dedupeKey?: string;
    requestContext: RequestLogContext;
    isCompositeParent?: boolean;
};

type DedupeRecentEntry = {
    taskId: string;
    expiresAt: number;
};

export class BackgroundTaskRegistry {
    private readonly tasks = new Map<string, BackgroundTaskRecord<BackgroundTaskResultPayload>>();
    private readonly sessions = new Map<string, TaskSessionState>();
    private readonly activeTaskByDedupeKey = new Map<string, string>();
    private readonly recentTaskByDedupeKey = new Map<string, DedupeRecentEntry>();

    constructor(
        private readonly resultRetentionMs: number,
        private readonly logger: Logger,
    ) {}

    taskEntries(): IterableIterator<[string, BackgroundTaskRecord<BackgroundTaskResultPayload>]> {
        return this.tasks.entries();
    }

    getTask(taskId: string): BackgroundTaskRecord<BackgroundTaskResultPayload> | undefined {
        return this.tasks.get(taskId);
    }

    setTask(taskId: string, task: BackgroundTaskRecord<BackgroundTaskResultPayload>): void {
        this.tasks.set(taskId, task);
    }

    deleteTask(taskId: string): void {
        this.tasks.delete(taskId);
    }

    getSession(taskId: string): TaskSessionState | undefined {
        return this.sessions.get(taskId);
    }

    setSession(taskId: string, session: TaskSessionState): void {
        this.sessions.set(taskId, session);
    }

    deleteSession(taskId: string): void {
        this.sessions.delete(taskId);
    }

    deleteExpiredRecentDedupeTasks(now: number): void {
        for (const [dedupeKey, recent] of this.recentTaskByDedupeKey.entries()) {
            if (recent.expiresAt <= now) {
                this.recentTaskByDedupeKey.delete(dedupeKey);
            }
        }
    }

    setActiveDedupeTask(dedupeKey: string, taskId: string): void {
        this.activeTaskByDedupeKey.set(dedupeKey, taskId);
    }

    deleteActiveDedupeTask(dedupeKey: string): void {
        this.activeTaskByDedupeKey.delete(dedupeKey);
    }

    rememberRecentDedupeTask(dedupeKey: string, taskId: string, now: number = Date.now()): void {
        this.recentTaskByDedupeKey.set(dedupeKey, {
            taskId,
            expiresAt: now + this.resultRetentionMs,
        });
    }

    resolveDedupeTask(userId: string, dedupeKey: string, now: number = Date.now()): string | null {
        const activeTaskId = this.activeTaskByDedupeKey.get(dedupeKey);
        if (activeTaskId) {
            const task = this.tasks.get(activeTaskId);
            if (task && task.status === 'pending') {
                const ageMs = now - task.createdAt;
                if (ageMs <= this.resultRetentionMs) {
                    this.linkTaskTree(task, userId);
                    return activeTaskId;
                }

                this.logger.warn(
                    'stale active dedupe task detected, replaying work for duplicate request',
                    {
                        dedupeKey,
                        taskId: activeTaskId,
                        taskType: task.type,
                        ageMs,
                        retentionMs: this.resultRetentionMs,
                    },
                );
            } else if (task) {
                this.linkTaskTree(task, userId);
            }

            this.activeTaskByDedupeKey.delete(dedupeKey);
        }

        const recent = this.recentTaskByDedupeKey.get(dedupeKey);
        if (recent && recent.expiresAt > now) {
            const task = this.tasks.get(recent.taskId);
            if (task) {
                if (this.taskOrSubtasksHaveUndefinedResult(task)) {
                    this.recentTaskByDedupeKey.delete(dedupeKey);
                    return null;
                }

                this.linkTaskTree(task, userId);
                return recent.taskId;
            }

            this.recentTaskByDedupeKey.delete(dedupeKey);
        }

        return null;
    }

    getTaskResultForUser(userId: string, taskId: string): TaskLookupResult {
        const task = this.tasks.get(taskId);
        if (!task) {
            return { status: 'missing' };
        }

        if (!task.userIds.includes(userId)) {
            return { status: 'forbidden' };
        }

        if (task.status === 'pending') {
            return {
                status: 'pending',
                task: toTaskResponse(task),
            };
        }

        return {
            status: 'finished',
            task: toTaskResponse(task),
        };
    }

    addTaskUser(
        taskId: string,
        userId: string,
    ):
        | {
              task: BackgroundTaskRecord<BackgroundTaskResultPayload>;
              added: boolean;
          }
        | undefined {
        const task = this.tasks.get(taskId);
        if (!task) {
            return undefined;
        }

        return {
            task,
            added: this.linkTaskTree(task, userId),
        };
    }

    private linkUser(
        task: BackgroundTaskRecord<BackgroundTaskResultPayload>,
        userId: string,
    ): boolean {
        if (task.userIds.includes(userId)) {
            return false;
        }

        task.userIds.push(userId);
        return true;
    }

    private linkTaskTree(
        task: BackgroundTaskRecord<BackgroundTaskResultPayload>,
        userId: string,
    ): boolean {
        const added = this.linkUser(task, userId);

        for (const subtaskId of task.subtaskIds ?? []) {
            const subtask = this.tasks.get(subtaskId);
            if (subtask) {
                this.linkUser(subtask, userId);
            }
        }

        return added;
    }

    private taskOrSubtasksHaveUndefinedResult(
        task: BackgroundTaskRecord<BackgroundTaskResultPayload>,
    ): boolean {
        if (hasUndefinedValue(task.result)) {
            return true;
        }

        for (const subtaskId of task.subtaskIds ?? []) {
            const subtask = this.tasks.get(subtaskId);
            if (!subtask || hasUndefinedValue(subtask.result)) {
                return true;
            }
        }

        return false;
    }
}

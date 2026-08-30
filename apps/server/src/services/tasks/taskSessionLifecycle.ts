import type { Logger } from '../../common/logging/logger.js';
import { withTaskContext } from './taskContext.js';
import { sendTaskCompletedNotification } from './taskCompletionNotifier.js';
import { toTaskRequestContext } from './taskContext.js';
import type { BackgroundTaskQueue } from './taskQueue.js';
import type { BackgroundTaskRegistry, TaskSessionState } from './backgroundTaskRegistry.js';
import type {
    BackgroundTaskRecord,
    BackgroundTaskResultPayload,
} from '../../utils/types/taskTypes.js';
import { mergeTaskResult } from './taskResultSerialization.js';

type TaskLifecycleContext = {
    logger: Logger;
    registry: BackgroundTaskRegistry;
};

type ExpireOrphanedPendingTaskOptions = TaskLifecycleContext & {
    inactiveForMs: number;
    orphanTtlMs: number;
    queue: BackgroundTaskQueue;
    session: TaskSessionState | undefined;
    task: BackgroundTaskRecord<BackgroundTaskResultPayload>;
    taskId: string;
};

type CompleteSessionWithoutPagesOptions = TaskLifecycleContext & {
    session: TaskSessionState;
    task: BackgroundTaskRecord<BackgroundTaskResultPayload>;
    taskId: string;
};

const shouldNotifyTaskCompletion = (
    task: BackgroundTaskRecord<BackgroundTaskResultPayload>,
): boolean => task.notifyOnCompletion !== false;

const updateParentSubtaskCompletion = ({
    logger,
    registry,
    task,
    taskId,
}: TaskLifecycleContext & {
    task: BackgroundTaskRecord<BackgroundTaskResultPayload>;
    taskId: string;
}): void => {
    if (!task.parentTaskId) {
        return;
    }

    const parentTask = registry.getTask(task.parentTaskId);
    const parentSession = registry.getSession(task.parentTaskId);
    if (!parentTask || !parentSession || parentTask.status !== 'pending') {
        return;
    }

    parentSession.tasksHandled += 1;
    parentSession.lastActivityAt = Date.now();
    parentTask.subtaskCount =
        parentSession.totalPages > 0 ? parentSession.totalPages : parentSession.pagesReceived;
    parentTask.completedSubtaskCount = parentSession.tasksHandled;
    parentTask.completedSubtaskIds = [...(parentTask.completedSubtaskIds ?? []), taskId];
    parentTask.result = mergeTaskResult(
        parentTask.result,
        task.result as Partial<BackgroundTaskResultPayload> | undefined,
    );

    if (task.status === 'failed') {
        parentSession.failed = true;
        if (!parentSession.error) {
            parentSession.error = task.error ?? `Subtask ${taskId} failed`;
        }
    }

    logger.info('background parent task subtask completed', {
        parentTaskId: task.parentTaskId,
        subtaskId: taskId,
        subtaskStatus: task.status,
        completedSubtaskCount: parentTask.completedSubtaskCount,
        subtaskCount: parentTask.subtaskCount,
    });

    void sendTaskCompletedNotification(
        parentTask.userIds,
        task.parentTaskId,
        parentTask.type,
        'progress',
        parentSession.requestContext,
        {
            subtaskId: taskId,
            completedSubtaskCount: parentTask.completedSubtaskCount,
            subtaskCount: parentTask.subtaskCount,
        },
    );

    maybeCompleteTaskSession({
        logger,
        registry,
        taskId: task.parentTaskId,
    });
};

export const expireOrphanedPendingTask = ({
    inactiveForMs,
    logger,
    orphanTtlMs,
    queue,
    registry,
    session,
    task,
    taskId,
}: ExpireOrphanedPendingTaskOptions): void => {
    const removedQueuedJobs = queue.removeByTaskId(taskId);

    if (session?.dedupeKey) {
        registry.deleteActiveDedupeTask(session.dedupeKey);
    }

    task.status = 'failed';
    task.completedAt = Date.now();
    task.error = 'Background task expired before completion';
    registry.deleteSession(taskId);
    updateParentSubtaskCompletion({
        logger,
        registry,
        task,
        taskId,
    });

    const taskContext = toTaskRequestContext(
        session?.requestContext,
        taskId,
        task.type,
        task.userIds[0],
    );

    void withTaskContext(taskContext, async () => {
        logger.warn('orphaned pending task expired', {
            inactiveForMs,
            orphanTtlMs,
            removedQueuedJobs,
        });

        if (shouldNotifyTaskCompletion(task)) {
            await sendTaskCompletedNotification(
                task.userIds,
                taskId,
                task.type,
                'failed',
                taskContext,
            );
        }
    });
};

export const completeTaskSessionWithoutPages = ({
    logger,
    registry,
    session,
    task,
    taskId,
}: CompleteSessionWithoutPagesOptions): void => {
    task.status = 'completed';
    task.completedAt = Date.now();

    if (session.dedupeKey) {
        registry.deleteActiveDedupeTask(session.dedupeKey);
        registry.rememberRecentDedupeTask(session.dedupeKey, taskId);
    }

    registry.deleteSession(taskId);
    updateParentSubtaskCompletion({
        logger,
        registry,
        task,
        taskId,
    });

    void withTaskContext(session.requestContext, async () => {
        logger.debug('background task completed without pages', {
            userCount: task.userIds.length,
        });
    });

    if (shouldNotifyTaskCompletion(task)) {
        void sendTaskCompletedNotification(
            task.userIds,
            taskId,
            task.type,
            'completed',
            session.requestContext,
        );
    }
};

export const maybeCompleteTaskSession = ({
    logger,
    registry,
    taskId,
}: TaskLifecycleContext & { taskId: string }): void => {
    const session = registry.getSession(taskId);
    const task = registry.getTask(taskId);

    if (!session || !task) {
        return;
    }

    if (session.totalPages <= 0) {
        return;
    }

    if (session.tasksHandled !== session.totalPages) {
        return;
    }

    task.status = session.failed ? 'failed' : 'completed';
    task.completedAt = Date.now();
    task.error = session.failed ? (session.error ?? 'Background task session failed') : undefined;

    if (session.dedupeKey) {
        registry.deleteActiveDedupeTask(session.dedupeKey);
        registry.rememberRecentDedupeTask(session.dedupeKey, taskId);
    }

    registry.deleteSession(taskId);
    updateParentSubtaskCompletion({
        logger,
        registry,
        task,
        taskId,
    });

    const taskContext = toTaskRequestContext(
        session.requestContext,
        taskId,
        task.type,
        task.userIds[0],
    );

    void withTaskContext(taskContext, async () => {
        logger.debug('background task completed', {
            status: task.status,
            pageCount: session.totalPages,
            userCount: task.userIds.length,
            durationMs: (task.completedAt ?? Date.now()) - task.createdAt,
        });

        if (shouldNotifyTaskCompletion(task)) {
            await sendTaskCompletedNotification(
                task.userIds,
                taskId,
                task.type,
                task.status === 'failed' ? 'failed' : 'completed',
                taskContext,
            );
        }
    });
};

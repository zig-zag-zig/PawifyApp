import type { Logger } from '../../common/logging/logger.js';
import type { BackgroundTaskResultPayload } from '../../utils/types/taskTypes.js';
import { mergeTaskResult } from './taskResultSerialization.js';
import { toTaskRequestContext, withTaskContext } from './taskContext.js';
import { type TaskJobProcessor } from './taskQueue.js';
import { runWorkerWithTimeout, WorkerTimeoutError } from './taskWorkerTimeout.js';
import type { BackgroundTaskRegistry } from './backgroundTaskRegistry.js';

type TaskJobProcessorOptions = {
    logger: Logger;
    registry: BackgroundTaskRegistry;
    workerTimeoutMs: number;
    onSessionMaybeComplete: (taskId: string) => void;
};

export const createTaskJobProcessor =
    ({
        logger,
        registry,
        workerTimeoutMs,
        onSessionMaybeComplete,
    }: TaskJobProcessorOptions): TaskJobProcessor =>
    async (job, getStats) => {
        try {
            const task = registry.getTask(job.taskId);
            const session = registry.getSession(job.taskId);

            if (!task || !session) {
                return;
            }

            const taskContext = toTaskRequestContext(
                session.requestContext,
                job.taskId,
                task.type,
                task.userIds[0],
            );

            await withTaskContext(taskContext, async () => {
                const pageStartedAt = Date.now();
                const queueWaitMs = pageStartedAt - job.queuedAt;
                const startStats = getStats();

                session.activeWorkers += 1;
                session.lastActivityAt = pageStartedAt;

                logger.debug('background task page started', {
                    pageNumber: job.pageNumber,
                    queueWaitMs,
                    activeWorkers: session.activeWorkers,
                    activeTaskCount: startStats.activeTaskCount,
                    pendingQueueSize: startStats.pendingQueueSize,
                });

                let pageStatus: 'completed' | 'failed' = 'completed';

                try {
                    const partial = await runWorkerWithTimeout(job.worker, workerTimeoutMs);
                    task.result = mergeTaskResult(
                        task.result as BackgroundTaskResultPayload | undefined,
                        partial as Partial<BackgroundTaskResultPayload> | void,
                    );
                } catch (error) {
                    pageStatus = 'failed';
                    session.failed = true;
                    const message = error instanceof Error ? error.message : 'Unknown task error';
                    if (!session.error) {
                        session.error = message;
                    }
                    if (error instanceof WorkerTimeoutError) {
                        logger.warn('background task page timed out', {
                            pageNumber: job.pageNumber,
                            timeoutMs: workerTimeoutMs,
                        });
                    } else {
                        logger.error('background task page failed', {
                            pageNumber: job.pageNumber,
                            error,
                        });
                    }
                } finally {
                    session.activeWorkers = Math.max(0, session.activeWorkers - 1);
                    session.lastActivityAt = Date.now();
                    session.tasksHandled += 1;
                    onSessionMaybeComplete(job.taskId);

                    logger.debug('background task page completed', {
                        pageNumber: job.pageNumber,
                        status: pageStatus,
                        durationMs: Date.now() - pageStartedAt,
                        queueWaitMs,
                        pagesHandled: session.tasksHandled,
                        totalPages: session.totalPages,
                    });
                }
            });
        } catch (error) {
            logger.error('background task dispatcher failed', {
                taskId: job.taskId,
                pageNumber: job.pageNumber,
                error,
            });
        }
    };

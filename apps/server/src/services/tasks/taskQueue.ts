import type { BackgroundTaskResultPayload } from '../../utils/types/taskTypes.js';

export type PendingJob = {
    taskId: string;
    pageNumber: number;
    queuedAt: number;
    worker: (signal: AbortSignal) => Promise<Partial<BackgroundTaskResultPayload> | void>;
};

export type TaskQueueStats = {
    activeTaskCount: number;
    pendingQueueSize: number;
};

export type TaskJobProcessor = (job: PendingJob, getStats: () => TaskQueueStats) => Promise<void>;

export class BackgroundTaskQueue {
    private readonly pendingJobs: PendingJob[] = [];
    private activeJobs = 0;

    constructor(
        private readonly maxConcurrency: number,
        private readonly processJob: TaskJobProcessor,
    ) {}

    get activeTaskCount(): number {
        return this.activeJobs;
    }

    get pendingQueueSize(): number {
        return this.pendingJobs.length;
    }

    enqueue(job: PendingJob): void {
        this.pendingJobs.push(job);
        this.pump();
    }

    removeByTaskId(taskId: string): number {
        let removedCount = 0;

        for (let index = this.pendingJobs.length - 1; index >= 0; index -= 1) {
            if (this.pendingJobs[index]?.taskId === taskId) {
                this.pendingJobs.splice(index, 1);
                removedCount += 1;
            }
        }

        return removedCount;
    }

    private getStats = (): TaskQueueStats => {
        return {
            activeTaskCount: this.activeJobs,
            pendingQueueSize: this.pendingJobs.length,
        };
    };

    private pump(): void {
        while (this.activeJobs < this.maxConcurrency && this.pendingJobs.length > 0) {
            const nextJob = this.pendingJobs.shift();
            if (!nextJob) {
                break;
            }

            this.run(nextJob);
        }
    }

    private run(job: PendingJob): void {
        this.activeJobs += 1;

        void (async () => {
            try {
                await this.processJob(job, this.getStats);
            } finally {
                this.activeJobs = Math.max(0, this.activeJobs - 1);
                this.pump();
            }
        })();
    }
}

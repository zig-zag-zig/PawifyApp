export class WorkerTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Background task worker timed out after ${timeoutMs}ms`);
        this.name = 'WorkerTimeoutError';
    }
}

export const runWorkerWithTimeout = async <T>(
    worker: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
): Promise<T> => {
    const controller = new AbortController();
    const workerPromise = worker(controller.signal);
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
            controller.abort();
            reject(new WorkerTimeoutError(timeoutMs));
        }, timeoutMs);
    });

    try {
        return await Promise.race([workerPromise, timeoutPromise]);
    } finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }

        // Prevent unhandled rejections if timeout won the race and worker settles later.
        void workerPromise.catch(() => {});
    }
};

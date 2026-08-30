const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createAbortError = (): Error => {
    const error = new Error('Request aborted');
    error.name = 'AbortError';
    return error;
};

export const isAbortError = (error: unknown): boolean => {
    return error instanceof Error && error.name === 'AbortError';
};

export const delayWithAbort = async (ms: number, signal?: AbortSignal): Promise<void> => {
    if (!signal) {
        await delay(ms);
        return;
    }

    if (signal.aborted) {
        throw createAbortError();
    }

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);

        const onAbort = () => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
            reject(createAbortError());
        };

        signal.addEventListener('abort', onAbort);
    });
};

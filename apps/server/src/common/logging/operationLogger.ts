import type { Logger, LogLevel, LogMetadata } from './logger.js';

type OperationLoggerOptions<TArgs extends unknown[], TResult> = {
    successLevel?: LogLevel | 'silent';
    startLevel?: LogLevel | 'silent';
    getMetadata?: (...args: TArgs) => LogMetadata;
    getResultMetadata?: (result: TResult) => LogMetadata;
};

export const withOperationLogging = <TArgs extends unknown[], TResult>(
    logger: Logger,
    operation: string,
    handler: (...args: TArgs) => Promise<TResult>,
    options: OperationLoggerOptions<TArgs, TResult> = {},
): ((...args: TArgs) => Promise<TResult>) => {
    return async (...args: TArgs): Promise<TResult> => {
        const startedAt = Date.now();
        const baseMetadata = options.getMetadata?.(...args);

        if (options.startLevel && options.startLevel !== 'silent') {
            logger[options.startLevel](`${operation} started`, baseMetadata);
        } else {
            logger.debug(`${operation} started`, baseMetadata);
        }

        try {
            const result = await handler(...args);
            const durationMs = Date.now() - startedAt;
            const resultMetadata = options.getResultMetadata?.(result);
            const metadata = {
                ...baseMetadata,
                ...resultMetadata,
                durationMs,
            };

            const successLevel = options.successLevel ?? (durationMs >= 1_000 ? 'info' : 'debug');
            if (successLevel !== 'silent') {
                logger[successLevel](`${operation} completed`, metadata);
            }

            return result;
        } catch (error) {
            logger.error(`${operation} failed`, {
                ...baseMetadata,
                durationMs: Date.now() - startedAt,
                error,
            });
            throw error;
        }
    };
};

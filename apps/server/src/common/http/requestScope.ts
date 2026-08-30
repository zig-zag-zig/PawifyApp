import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import type { Logger } from '../logging/logger.js';
import { runWithRequestContext } from '../logging/requestContext.js';
import { toHttpError } from './errors.js';

type HttpRequestScopeOptions = {
    endpointName: string;
    handler: () => Promise<void> | void;
    logger: Logger;
    requestKind: 'authenticated' | 'public';
    req: Request;
    res: Response;
};

const resolveRequestId = (req: Request): string => {
    const fromHeader = req.header('x-request-id');
    const normalized = typeof fromHeader === 'string' ? fromHeader.trim() : '';
    return normalized.length > 0 ? normalized : randomUUID();
};

export const runHttpRequestScope = async ({
    endpointName,
    handler,
    logger,
    requestKind,
    req,
    res,
}: HttpRequestScopeOptions): Promise<void> => {
    const requestId = resolveRequestId(req);
    res.setHeader('x-request-id', requestId);

    // Stash the request id so errorMiddleware (which runs outside the request-log
    // context after asyncHandler forwards the error) can still correlate its logs.
    res.locals.requestId = requestId;

    await runWithRequestContext(
        {
            requestId,
            endpoint: endpointName,
            method: req.method,
            path: req.originalUrl,
        },
        async () => {
            const startedAt = Date.now();
            logger.debug(`${requestKind} request started`);

            try {
                await handler();
            } catch (error) {
                // Log inside the request context so the entry carries requestId
                // (and any userId/taskId fields set by the handler), then rethrow
                // so the error middleware still maps and responds with the error.
                const httpError = toHttpError(error);
                const metadata = {
                    error,
                    statusCode: httpError.statusCode,
                    durationMs: Date.now() - startedAt,
                };
                if (httpError.statusCode >= 500) {
                    logger.error(`${requestKind} request failed`, metadata);
                } else {
                    logger.debug(`${requestKind} request failed`, metadata);
                }
                throw error;
            }

            logger.debug(`${requestKind} request completed`, {
                statusCode: res.statusCode,
                durationMs: Date.now() - startedAt,
            });
        },
    );
};

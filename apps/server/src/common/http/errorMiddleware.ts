import type { ErrorRequestHandler } from 'express';
import { toHttpError } from './errors.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('http.error');

export const errorMiddleware: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    const httpError = toHttpError(error);
    const requestId = typeof res.locals?.requestId === 'string' ? res.locals.requestId : undefined;
    const metadata = {
        ...(requestId ? { requestId } : {}),
        method: req.method,
        path: req.originalUrl,
        statusCode: httpError.statusCode,
        error,
    };

    if (httpError.statusCode >= 500) {
        logger.error(httpError.message, metadata);
    } else {
        logger.debug(httpError.message, metadata);
    }

    res.status(httpError.statusCode).json({
        message: httpError.expose ? httpError.message : 'Internal server error.',
        statusCode: httpError.statusCode,
    });
};

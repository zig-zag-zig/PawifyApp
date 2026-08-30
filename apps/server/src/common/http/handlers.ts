import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createLogger } from '../logging/logger.js';
import { runHttpRequestScope } from './requestScope.js';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
const logger = createLogger('http');

export const asyncHandler = (handler: Handler): RequestHandler => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};

export const publicHandler = (
    endpointName: string,
    handler: (req: Request, res: Response) => Promise<void> | void,
): RequestHandler => {
    return asyncHandler(async (req, res) => {
        await runHttpRequestScope({
            endpointName,
            logger,
            requestKind: 'public',
            req,
            res,
            handler: async () => {
                await handler(req, res);
            },
        });
    });
};

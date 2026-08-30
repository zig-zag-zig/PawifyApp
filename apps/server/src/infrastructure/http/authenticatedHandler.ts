import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler } from '../../common/http/handlers.js';
import { UnauthorizedError } from '../../common/http/errors.js';
import { runHttpRequestScope } from '../../common/http/requestScope.js';
import { createLogger } from '../../common/logging/logger.js';
import { setRequestContextFields } from '../../common/logging/requestContext.js';
import { checkAuth } from '../../services/firebase/userStore.js';

type AuthenticatedHandler = (context: {
    req: Request;
    res: Response;
    userId: string;
}) => Promise<void> | void;

const logger = createLogger('http.auth');

export const authenticatedHandler = (
    endpointName: string,
    handler: AuthenticatedHandler,
): RequestHandler => {
    return asyncHandler(async (req, res) => {
        await runHttpRequestScope({
            endpointName,
            logger,
            requestKind: 'authenticated',
            req,
            res,
            handler: async () => {
                // Authenticated API responses are user-specific and should always be fresh.
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');

                const userId = await checkAuth(req).catch((error) => {
                    logger.debug('authentication failed', { error });
                    throw new UnauthorizedError();
                });

                setRequestContextFields({ userId });

                await handler({ req, res, userId });
            },
        });
    });
};

import { authenticatedHandler } from '../../infrastructure/http/authenticatedHandler.js';
import { setRequestContextFields } from '../../common/logging/requestContext.js';
import { requireString } from '../../common/http/validation.js';
import { taskUseCases } from './taskUseCases.js';

export const getTaskResultHandler = authenticatedHandler(
    '/getTaskResult',
    async ({ req, res, userId }) => {
        const taskId = requireString(req.body, 'taskId');
        setRequestContextFields({ taskId });

        res.status(200).send(await taskUseCases.getTaskResult(userId, taskId));
    },
);

import { ForbiddenError, NotFoundError } from '../../../common/http/errors.js';
import type {
    BackgroundTaskResultPayload,
    TaskResultResponse,
} from '../../../utils/types/taskTypes.js';
import type { TaskUseCaseDependencies } from '../ports.js';

export const createGetTaskResultUseCase =
    ({ taskResultGateway }: TaskUseCaseDependencies) =>
    (userId: string, taskId: string): TaskResultResponse<BackgroundTaskResultPayload> => {
        const lookup = taskResultGateway.getTaskResultForUser(userId, taskId);

        if (lookup.status === 'missing') {
            throw new NotFoundError('Task was not found');
        }

        if (lookup.status === 'forbidden') {
            throw new ForbiddenError('Task does not belong to the authenticated user');
        }

        return lookup.task;
    };

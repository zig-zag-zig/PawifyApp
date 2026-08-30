import { createLogger } from '../../common/logging/logger.js';
import { withOperationLogging } from '../../common/logging/operationLogger.js';
import { taskDependencies } from './infrastructure/taskDependencies.js';
import { createGetTaskResultUseCase } from './usecases/getTaskResult.js';

const logger = createLogger('features.tasks');
const getTaskResultUseCase = createGetTaskResultUseCase(taskDependencies);

export const taskUseCases = {
    getTaskResult: withOperationLogging(
        logger,
        'getTaskResult',
        async (userId: string, taskId: string) => getTaskResultUseCase(userId, taskId),
        {
            getMetadata: (_userId, taskId) => ({ taskId }),
            getResultMetadata: (result) => ({
                taskType: result.type,
                taskStatus: result.status,
            }),
        },
    ),
};

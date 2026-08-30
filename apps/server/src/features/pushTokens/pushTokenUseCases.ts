import { createLogger } from '../../common/logging/logger.js';
import { withOperationLogging } from '../../common/logging/operationLogger.js';
import { pushTokenDependencies } from './infrastructure/pushTokenDependencies.js';
import {
    createDeletePushTokenUseCase,
    createSavePushTokenUseCase,
} from './usecases/pushTokenUseCases.js';

const logger = createLogger('features.pushTokens');

export const pushTokenUseCases = {
    deletePushToken: withOperationLogging(
        logger,
        'deletePushToken',
        createDeletePushTokenUseCase(pushTokenDependencies),
        {
            successLevel: 'info',
        },
    ),
    savePushToken: withOperationLogging(
        logger,
        'savePushToken',
        createSavePushTokenUseCase(pushTokenDependencies),
        {
            successLevel: 'info',
        },
    ),
};

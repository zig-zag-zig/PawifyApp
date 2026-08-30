import { createLogger } from '../../common/logging/logger.js';
import { withOperationLogging } from '../../common/logging/operationLogger.js';
import { notificationDependencies } from './infrastructure/notificationDependencies.js';
import { createNotifyNewReleasesUseCase } from './usecases/notifyNewReleases.js';

const logger = createLogger('features.notifications');

export const notificationUseCases = {
    notifyNewReleases: withOperationLogging(
        logger,
        'notifyNewReleases',
        createNotifyNewReleasesUseCase(notificationDependencies),
        {
            successLevel: 'info',
        },
    ),
};

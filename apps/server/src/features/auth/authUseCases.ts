import { createLogger } from '../../common/logging/logger.js';
import { withOperationLogging } from '../../common/logging/operationLogger.js';
import { authDependencies } from './infrastructure/authDependencies.js';
import {
    createChangeEmailUseCase,
    createDeleteUserAccountUseCase,
    createRevokeTokenUseCase,
    createSendOtpUseCase,
    createVerifyOtpUseCase,
} from './usecases/authUseCases.js';

const logger = createLogger('features.auth');

export const authUseCases = {
    changeEmail: withOperationLogging(
        logger,
        'changeEmail',
        createChangeEmailUseCase(authDependencies),
        {
            successLevel: 'info',
        },
    ),
    deleteUserAccount: withOperationLogging(
        logger,
        'deleteUserAccount',
        createDeleteUserAccountUseCase(authDependencies),
        {
            successLevel: 'info',
        },
    ),
    revokeToken: withOperationLogging(
        logger,
        'revokeToken',
        createRevokeTokenUseCase(authDependencies),
        {
            successLevel: 'info',
        },
    ),
    sendOtp: withOperationLogging(logger, 'sendOtp', createSendOtpUseCase(authDependencies), {
        successLevel: 'info',
    }),
    verifyOtp: withOperationLogging(logger, 'verifyOtp', createVerifyOtpUseCase(authDependencies), {
        successLevel: 'info',
    }),
};

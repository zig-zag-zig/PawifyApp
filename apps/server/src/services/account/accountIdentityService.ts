import { auth } from '../../infrastructure/firebase/firebaseInit.js';
import { createLogger } from '../../common/logging/logger.js';
import { AccountError } from './accountErrors.js';

const logger = createLogger('services.account.identity');

export const revokeToken = async (userId: string): Promise<void> => {
    try {
        await auth.revokeRefreshTokens(userId);
    } catch (error) {
        logger.warn('revoke token failed', { error });
        throw new AccountError(
            'SESSION_UPDATE_FAILED',
            'Could not update the sign-in session. Please try again.',
        );
    }
};

export const changeEmail = async (userId: string, email: string): Promise<void> => {
    try {
        await auth.updateUser(userId, { email });
    } catch (error) {
        logger.warn('change email failed', { error });
        throw new AccountError('EMAIL_CHANGE_FAILED', 'Could not change email. Please try again.');
    }
};

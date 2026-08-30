import { BadRequestError } from '../../../common/http/errors.js';
import { AccountError, type AccountErrorCode } from '../../../services/account/accountErrors.js';
import type { AuthUseCaseDependencies } from '../ports.js';

// User-facing message overrides per typed failure. Codes not listed here
// already carry their user-facing message on the AccountError itself.
const USER_FACING_MESSAGES: Partial<Record<AccountErrorCode, string>> = {
    // Deliberately hide whether the account exists: the reset flow treats an
    // unknown email like an expired request.
    USER_NOT_FOUND: 'Invalid or expired password reset request.',
};

const mapAccountError = (error: unknown): never => {
    if (error instanceof AccountError) {
        throw new BadRequestError(USER_FACING_MESSAGES[error.code] ?? error.message);
    }

    // Unexpected errors (TypeError, Firestore/Auth outages, anything
    // unrecognized) propagate unwrapped so errorMiddleware returns 500
    // without leaking internal messages.
    throw error;
};

export const createSendOtpUseCase =
    ({ accountGateway }: Pick<AuthUseCaseDependencies, 'accountGateway'>) =>
    async (email: string): Promise<void> => {
        try {
            await accountGateway.sendOtp(email);
        } catch (error) {
            mapAccountError(error);
        }
    };

export const createVerifyOtpUseCase =
    ({ accountGateway }: Pick<AuthUseCaseDependencies, 'accountGateway'>) =>
    async (email: string, otp: string): Promise<string> => {
        try {
            return await accountGateway.verifyOtp(email, otp);
        } catch (error) {
            return mapAccountError(error);
        }
    };

export const createRevokeTokenUseCase =
    ({ accountGateway }: Pick<AuthUseCaseDependencies, 'accountGateway'>) =>
    async (userId: string): Promise<void> => {
        try {
            await accountGateway.revokeToken(userId);
        } catch (error) {
            mapAccountError(error);
        }
    };

export const createChangeEmailUseCase =
    ({ accountGateway }: Pick<AuthUseCaseDependencies, 'accountGateway'>) =>
    async (userId: string, email: string): Promise<void> => {
        try {
            await accountGateway.changeEmail(userId, email);
        } catch (error) {
            mapAccountError(error);
        }
    };

export const createDeleteUserAccountUseCase =
    ({ accountGateway, requestDeduper }: AuthUseCaseDependencies) =>
    async (userId: string): Promise<void> => {
        await accountGateway.deleteUserAccount(userId);

        // The account is gone; drop every per-user dedupe read key that exists so no
        // stale following/artist/release/search state can be served for this user.
        // Global (non-user-scoped) keys such as getRelease are left untouched.
        requestDeduper.invalidate(`getFollowing:${userId}`);
        requestDeduper.invalidate(`getArtistDetails:${userId}:`);
        requestDeduper.invalidate(`getArtistReleases:${userId}:`);
        requestDeduper.invalidate(`getReleaseGroupReleases:${userId}:`);
        requestDeduper.invalidate(`searchArtists:${userId}:`);
    };

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BadRequestError, toHttpError } from '../src/common/http/errors.js';
import { AccountError } from '../src/services/account/accountErrors.js';
import {
    createSendOtpUseCase,
    createVerifyOtpUseCase,
    createRevokeTokenUseCase,
    createChangeEmailUseCase,
    createDeleteUserAccountUseCase,
} from '../src/features/auth/usecases/authUseCases.js';
import type { AuthUseCaseDependencies } from '../src/features/auth/ports.js';

const createFakeDependencies = (
    overrides: Partial<AuthUseCaseDependencies> = {},
): AuthUseCaseDependencies => ({
    accountGateway: {
        async sendOtp() {},
        async verifyOtp() {
            return 'token-123';
        },
        async revokeToken() {},
        async changeEmail() {},
        async deleteUserAccount() {},
        ...overrides.accountGateway,
    },
    requestDeduper: {
        async run<T>(_key: string, worker: () => Promise<T>): Promise<T> {
            return worker();
        },
        invalidate() {},
        ...overrides.requestDeduper,
    },
});

// Asserts the error propagates unwrapped (not a BadRequestError) and maps to a
// 500 at the HTTP boundary — the contract for unexpected service failures.
const assertBecomes500 = (error: unknown): boolean => {
    assert.ok(!(error instanceof BadRequestError), 'unexpected errors are not mapped to 400');
    assert.equal(toHttpError(error).statusCode, 500);
    return true;
};

describe('auth use cases', () => {
    describe('sendOtp', () => {
        it('calls accountGateway.sendOtp with the email', async () => {
            let calledWith: string | undefined;
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async sendOtp(email) {
                        calledWith = email;
                    },
                },
            });
            const useCase = createSendOtpUseCase(deps);

            await useCase('user@example.com');
            assert.equal(calledWith, 'user@example.com');
        });

        it('maps AccountError USER_NOT_FOUND to BadRequestError "Invalid or expired password reset request."', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async sendOtp() {
                        throw new AccountError('USER_NOT_FOUND', 'User not found');
                    },
                },
            });
            const useCase = createSendOtpUseCase(deps);

            await assert.rejects(
                () => useCase('bad@example.com'),
                (error) =>
                    error instanceof BadRequestError &&
                    error.message === 'Invalid or expired password reset request.',
            );
        });

        it('maps AccountError OTP_DELIVERY_FAILED to BadRequestError with the delivery message', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async sendOtp() {
                        throw new AccountError(
                            'OTP_DELIVERY_FAILED',
                            'Could not send OTP. Please check the email address and try again.',
                        );
                    },
                },
            });
            const useCase = createSendOtpUseCase(deps);

            await assert.rejects(
                () => useCase('user@example.com'),
                (error) =>
                    error instanceof BadRequestError &&
                    error.message ===
                        'Could not send OTP. Please check the email address and try again.',
            );
        });

        it('lets unexpected gateway errors propagate so errorMiddleware returns 500', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async sendOtp() {
                        throw new Error('Firestore is unavailable');
                    },
                },
            });
            const useCase = createSendOtpUseCase(deps);

            await assert.rejects(
                () => useCase('user@example.com'),
                (error) => {
                    assert.equal(
                        error instanceof Error ? error.message : String(error),
                        'Firestore is unavailable',
                    );
                    return assertBecomes500(error);
                },
            );
        });
    });

    describe('verifyOtp', () => {
        it('returns the token on success', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async verifyOtp() {
                        return 'reset-token-abc';
                    },
                },
            });
            const useCase = createVerifyOtpUseCase(deps);

            const result = await useCase('user@example.com', '123456');
            assert.equal(result, 'reset-token-abc');
        });

        it('maps AccountError INVALID_OTP to BadRequestError "Invalid OTP"', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async verifyOtp() {
                        throw new AccountError('INVALID_OTP', 'Invalid OTP');
                    },
                },
            });
            const useCase = createVerifyOtpUseCase(deps);

            await assert.rejects(
                () => useCase('user@example.com', '000000'),
                (error) => error instanceof BadRequestError && error.message === 'Invalid OTP',
            );
        });

        it('maps AccountError RESET_REQUEST_NOT_FOUND to BadRequestError with the request message', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async verifyOtp() {
                        throw new AccountError(
                            'RESET_REQUEST_NOT_FOUND',
                            'Password reset request was not found or has expired.',
                        );
                    },
                },
            });
            const useCase = createVerifyOtpUseCase(deps);

            await assert.rejects(
                () => useCase('user@example.com', '123456'),
                (error) =>
                    error instanceof BadRequestError &&
                    error.message === 'Password reset request was not found or has expired.',
            );
        });

        it('lets unexpected gateway errors propagate so errorMiddleware returns 500', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async verifyOtp() {
                        throw new TypeError('resetData.expiresAt.toDate is not a function');
                    },
                },
            });
            const useCase = createVerifyOtpUseCase(deps);

            await assert.rejects(() => useCase('user@example.com', '123456'), assertBecomes500);
        });
    });

    describe('revokeToken', () => {
        it('calls accountGateway.revokeToken with the userId', async () => {
            let calledWith: string | undefined;
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async revokeToken(userId) {
                        calledWith = userId;
                    },
                },
            });
            const useCase = createRevokeTokenUseCase(deps);

            await useCase('user-1');
            assert.equal(calledWith, 'user-1');
        });

        it('maps AccountError SESSION_UPDATE_FAILED to BadRequestError with the session message', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async revokeToken() {
                        throw new AccountError(
                            'SESSION_UPDATE_FAILED',
                            'Could not update the sign-in session. Please try again.',
                        );
                    },
                },
            });
            const useCase = createRevokeTokenUseCase(deps);

            await assert.rejects(
                () => useCase('user-1'),
                (error) =>
                    error instanceof BadRequestError &&
                    error.message === 'Could not update the sign-in session. Please try again.',
            );
        });

        it('lets unexpected gateway errors propagate so errorMiddleware returns 500', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async revokeToken() {
                        throw new Error('Auth service unavailable');
                    },
                },
            });
            const useCase = createRevokeTokenUseCase(deps);

            await assert.rejects(() => useCase('user-1'), assertBecomes500);
        });
    });

    describe('changeEmail', () => {
        it('calls accountGateway.changeEmail with userId and email', async () => {
            const calls: Array<{ userId: string; email: string }> = [];
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async changeEmail(userId, email) {
                        calls.push({ userId, email });
                    },
                },
            });
            const useCase = createChangeEmailUseCase(deps);

            await useCase('user-1', 'new@example.com');
            assert.deepEqual(calls, [{ userId: 'user-1', email: 'new@example.com' }]);
        });

        it('maps AccountError EMAIL_CHANGE_FAILED to BadRequestError with the email message', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async changeEmail() {
                        throw new AccountError(
                            'EMAIL_CHANGE_FAILED',
                            'Could not change email. Please try again.',
                        );
                    },
                },
            });
            const useCase = createChangeEmailUseCase(deps);

            await assert.rejects(
                () => useCase('user-1', 'dup@example.com'),
                (error) =>
                    error instanceof BadRequestError &&
                    error.message === 'Could not change email. Please try again.',
            );
        });

        it('lets unexpected gateway errors propagate so errorMiddleware returns 500', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async changeEmail() {
                        throw new Error('Firestore is unavailable');
                    },
                },
            });
            const useCase = createChangeEmailUseCase(deps);

            await assert.rejects(() => useCase('user-1', 'new@example.com'), assertBecomes500);
        });
    });

    describe('deleteUserAccount', () => {
        it('deletes account and invalidates per-user read keys', async () => {
            const calls: string[] = [];
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async deleteUserAccount(userId) {
                        calls.push(`delete:${userId}`);
                    },
                },
                requestDeduper: {
                    async run<T>(_key: string, worker: () => Promise<T>): Promise<T> {
                        return worker();
                    },
                    invalidate(keyPrefix) {
                        calls.push(`invalidate:${keyPrefix}`);
                    },
                },
            });
            const useCase = createDeleteUserAccountUseCase(deps);

            await useCase('user-1');
            assert.deepEqual(calls, [
                'delete:user-1',
                'invalidate:getFollowing:user-1',
                'invalidate:getArtistDetails:user-1:',
                'invalidate:getArtistReleases:user-1:',
                'invalidate:getReleaseGroupReleases:user-1:',
                'invalidate:searchArtists:user-1:',
            ]);
        });

        it('propagates gateway errors without wrapping', async () => {
            const deps = createFakeDependencies({
                accountGateway: {
                    ...createFakeDependencies().accountGateway,
                    async deleteUserAccount() {
                        throw new Error('Cannot delete admin');
                    },
                },
            });
            const useCase = createDeleteUserAccountUseCase(deps);

            await assert.rejects(
                () => useCase('admin-1'),
                (error) => error instanceof Error && error.message === 'Cannot delete admin',
            );
        });
    });
});

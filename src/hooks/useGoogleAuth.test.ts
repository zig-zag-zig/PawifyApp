import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    NativeModules: { GoogleSignInModule: null },
    Platform: { OS: 'android' },
}));

vi.mock('../config/env', () => ({
    ENV: { googleWebClientId: 'test-client-id' },
}));

describe('useGoogleAuth error helpers', () => {
    async function loadModule() {
        const mod = await import('./useGoogleAuth');
        return { getGoogleSignInErrorCode: mod.getGoogleSignInErrorCode, isGoogleSignInCancellation: mod.isGoogleSignInCancellation };
    }

    describe('getGoogleSignInErrorCode', () => {
        it('extracts code from error object', async () => {
            const { getGoogleSignInErrorCode } = await loadModule();
            const error = { code: 'USER_CANCELLED' };
            expect(getGoogleSignInErrorCode(error)).toBe('USER_CANCELLED');
        });

        it('returns undefined for non-object values', async () => {
            const { getGoogleSignInErrorCode } = await loadModule();
            expect(getGoogleSignInErrorCode(null)).toBeUndefined();
            expect(getGoogleSignInErrorCode(undefined)).toBeUndefined();
            expect(getGoogleSignInErrorCode('string')).toBeUndefined();
            expect(getGoogleSignInErrorCode(42)).toBeUndefined();
        });

        it('returns undefined when code is not a string', async () => {
            const { getGoogleSignInErrorCode } = await loadModule();
            expect(getGoogleSignInErrorCode({ code: 123 })).toBeUndefined();
            expect(getGoogleSignInErrorCode({ code: null })).toBeUndefined();
        });

        it('returns undefined when code is missing', async () => {
            const { getGoogleSignInErrorCode } = await loadModule();
            expect(getGoogleSignInErrorCode({ message: 'error' })).toBeUndefined();
        });
    });

    describe('isGoogleSignInCancellation', () => {
        it('returns true for USER_CANCELLED code', async () => {
            const { isGoogleSignInCancellation } = await loadModule();
            expect(isGoogleSignInCancellation({ code: 'USER_CANCELLED' })).toBe(true);
        });

        it('returns true for error message matching pattern', async () => {
            const { isGoogleSignInCancellation } = await loadModule();
            expect(isGoogleSignInCancellation(new Error('Google sign-in was cancelled'))).toBe(true);
        });

        it('is case-insensitive for message matching', async () => {
            const { isGoogleSignInCancellation } = await loadModule();
            expect(isGoogleSignInCancellation(new Error('GOOGLE SIGN-IN WAS CANCELLED'))).toBe(true);
        });

        it('returns false for non-cancellation errors', async () => {
            const { isGoogleSignInCancellation } = await loadModule();
            expect(isGoogleSignInCancellation({ code: 'SIGNIN_FAILED' })).toBe(false);
            expect(isGoogleSignInCancellation(new Error('Some other error'))).toBe(false);
        });

        it('returns false for null/undefined', async () => {
            const { isGoogleSignInCancellation } = await loadModule();
            expect(isGoogleSignInCancellation(null)).toBe(false);
            expect(isGoogleSignInCancellation(undefined)).toBe(false);
        });
    });
});

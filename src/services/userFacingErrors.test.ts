import { describe, expect, it } from 'vitest';
import { getUserFacingErrorMessage } from './userFacingErrors';

describe('getUserFacingErrorMessage', () => {
    describe('Firebase auth error codes', () => {
        it('maps auth/invalid-credential', () => {
            const error = Object.assign(new Error('test'), { code: 'auth/invalid-credential' });
            expect(getUserFacingErrorMessage(error)).toBe('Invalid email or password.');
        });

        it('maps auth/email-already-in-use', () => {
            const error = Object.assign(new Error('test'), { code: 'auth/email-already-in-use' });
            expect(getUserFacingErrorMessage(error)).toBe('An account with this email already exists.');
        });

        it('maps auth/user-not-found', () => {
            const error = Object.assign(new Error('test'), { code: 'auth/user-not-found' });
            expect(getUserFacingErrorMessage(error)).toBe('Invalid email or password.');
        });

        it('maps auth/wrong-password', () => {
            const error = Object.assign(new Error('test'), { code: 'auth/wrong-password' });
            expect(getUserFacingErrorMessage(error)).toBe('Invalid email or password.');
        });

        it('maps auth/too-many-requests', () => {
            const error = Object.assign(new Error('test'), { code: 'auth/too-many-requests' });
            expect(getUserFacingErrorMessage(error)).toBe('Too many attempts. Please wait a bit and try again.');
        });

        it('maps auth/weak-password', () => {
            const error = Object.assign(new Error('test'), { code: 'auth/weak-password' });
            expect(getUserFacingErrorMessage(error)).toBe('Password must be at least 6 characters long.');
        });

        it('maps auth/network-request-failed', () => {
            const error = Object.assign(new Error('test'), { code: 'auth/network-request-failed' });
            expect(getUserFacingErrorMessage(error)).toBe('Network request failed. Check your connection and try again.');
        });
    });

    describe('Google sign-in error codes', () => {
        it('maps USER_CANCELLED', () => {
            const error = Object.assign(new Error('test'), { code: 'USER_CANCELLED' });
            expect(getUserFacingErrorMessage(error)).toBe('Google sign-in was cancelled.');
        });

        it('maps NO_CREDENTIAL', () => {
            const error = Object.assign(new Error('test'), { code: 'NO_CREDENTIAL' });
            expect(getUserFacingErrorMessage(error)).toBe('No Google account is available on this device. Add a Google account and try again.');
        });

        it('maps NOT_INITIALIZED', () => {
            const error = Object.assign(new Error('test'), { code: 'NOT_INITIALIZED' });
            expect(getUserFacingErrorMessage(error)).toBe('Google sign-in is not available in this build.');
        });

        it('maps SIGNIN_FAILED', () => {
            const error = Object.assign(new Error('test'), { code: 'SIGNIN_FAILED' });
            expect(getUserFacingErrorMessage(error)).toBe('Google sign-in failed. Please try again.');
        });
    });

    describe('friendly messages pass through', () => {
        it('passes through "Invalid email or password"', () => {
            const error = new Error('Invalid email or password.');
            expect(getUserFacingErrorMessage(error)).toBe('Invalid email or password.');
        });

        it('passes through "Network request failed" messages', () => {
            const error = new Error('Network request failed. Check your connection.');
            expect(getUserFacingErrorMessage(error)).toBe('Network request failed. Check your connection.');
        });

        it('passes through "Please" prefixed messages', () => {
            const error = new Error('Please sign in again.');
            expect(getUserFacingErrorMessage(error)).toBe('Please sign in again.');
        });

        it('passes through "Something went wrong" messages', () => {
            const error = new Error('Something went wrong. Please try again.');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });

        it('passes through "Password" prefixed messages', () => {
            const error = new Error('Password must be at least 6 characters long.');
            expect(getUserFacingErrorMessage(error)).toBe('Password must be at least 6 characters long.');
        });

        it('passes through "The requested item" messages', () => {
            const error = new Error('The requested item was not found.');
            expect(getUserFacingErrorMessage(error)).toBe('The requested item was not found.');
        });
    });

    describe('internal messages are suppressed', () => {
        it('suppresses "firebase:" prefixed messages', () => {
            const error = new Error('firebase: auth/internal-error');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });

        it('suppresses "auth/" containing messages', () => {
            const error = new Error('Got auth/invalid-credential from server');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });

        it('suppresses "native module" messages', () => {
            const error = new Error('native module not found');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });

        it('suppresses "GoogleSignInModule" messages', () => {
            const error = new Error('GoogleSignInModule crash');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });

        it('suppresses "http error" messages', () => {
            const error = new Error('http error 500');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });

        it('suppresses "stack trace" messages', () => {
            const error = new Error('at Object.<anonymous> stack trace');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });
    });

    describe('fallback behavior', () => {
        it('returns fallback for null', () => {
            expect(getUserFacingErrorMessage(null)).toBe('Something went wrong. Please try again.');
        });

        it('returns fallback for undefined', () => {
            expect(getUserFacingErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
        });

        it('returns fallback for non-Error string', () => {
            expect(getUserFacingErrorMessage('raw string')).toBe('Something went wrong. Please try again.');
        });

        it('returns fallback for unknown error codes', () => {
            const error = Object.assign(new Error('test'), { code: 'UNKNOWN_CODE' });
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });

        it('returns custom fallback when provided', () => {
            expect(getUserFacingErrorMessage(null, 'Custom fallback')).toBe('Custom fallback');
        });

        it('returns fallback for friendly AND internal messages', () => {
            // "auth/" is internal, so it should be suppressed even though the message looks friendly
            const error = new Error('auth/ token expired');
            expect(getUserFacingErrorMessage(error)).toBe('Something went wrong. Please try again.');
        });
    });
});

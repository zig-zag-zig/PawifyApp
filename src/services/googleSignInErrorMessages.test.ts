import { describe, expect, it } from 'vitest';
import { googleSignInErrorMessages } from './googleSignInErrorMessages';

describe('googleSignInErrorMessages', () => {
    it('provides messages for all expected error codes', () => {
        expect(googleSignInErrorMessages['USER_CANCELLED']).toBeDefined();
        expect(googleSignInErrorMessages['NO_CREDENTIAL']).toBeDefined();
        expect(googleSignInErrorMessages['NOT_INITIALIZED']).toBeDefined();
        expect(googleSignInErrorMessages['SIGNIN_FAILED']).toBeDefined();
        expect(googleSignInErrorMessages['SIGNIN_IN_PROGRESS']).toBeDefined();
        expect(googleSignInErrorMessages['MISSING_ID_TOKEN']).toBeDefined();
        expect(googleSignInErrorMessages['NO_ACTIVITY']).toBeDefined();
        expect(googleSignInErrorMessages['UNSUPPORTED_DEVICE']).toBeDefined();
    });

    it('all messages are non-empty strings', () => {
        Object.entries(googleSignInErrorMessages).forEach(([code, message]) => {
            expect(typeof message).toBe('string');
            expect(message.trim().length).toBeGreaterThan(0);
        });
    });

    it('contains all expected error code keys', () => {
        const keys = Object.keys(googleSignInErrorMessages);
        expect(keys.length).toBeGreaterThanOrEqual(10);
    });
});

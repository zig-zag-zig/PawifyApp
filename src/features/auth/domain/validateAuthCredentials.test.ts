import { describe, expect, it } from 'vitest';

import { validateAuthCredentials } from './validateAuthCredentials';

describe('auth credential validation', () => {
    it('skips validation for signIn mode', () => {
        expect(() => validateAuthCredentials('signIn', 'x', '')).not.toThrow();
        expect(() => validateAuthCredentials('signIn', '', '')).not.toThrow();
    });

    it('throws when passwords do not match for signUp', () => {
        expect(() => validateAuthCredentials('signUp', 'secret1', 'secret2'))
            .toThrow('Passwords do not match');
    });

    it('throws when password is too short for signUp', () => {
        expect(() => validateAuthCredentials('signUp', 'short', 'short'))
            .toThrow('Password must be at least 6 characters long');
    });

    it('accepts valid signUp with matching long passwords', () => {
        expect(() => validateAuthCredentials('signUp', 'secret1', 'secret1'))
            .not.toThrow();
    });

    it('accepts exactly 6 character passwords', () => {
        expect(() => validateAuthCredentials('signUp', '123456', '123456'))
            .not.toThrow();
    });
});

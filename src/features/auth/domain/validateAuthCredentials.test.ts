import { describe, expect, it } from 'vitest';

import { validateAuthCredentials } from './validateAuthCredentials';

describe('auth credential validation', () => {
    it('requires matching, minimum-length passwords only for sign up', () => {
        expect(() => validateAuthCredentials('signIn', 'x', '')).not.toThrow();

        expect(() => validateAuthCredentials('signUp', 'secret1', 'secret2'))
            .toThrow('Passwords do not match');
        expect(() => validateAuthCredentials('signUp', 'short', 'short'))
            .toThrow('Password must be at least 6 characters long');
        expect(() => validateAuthCredentials('signUp', 'secret1', 'secret1'))
            .not.toThrow();
    });
});

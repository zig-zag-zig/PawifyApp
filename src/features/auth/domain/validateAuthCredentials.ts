import type { AuthMode } from '../model/types';

export function validateAuthCredentials(
    mode: AuthMode,
    password: string,
    confirmPassword: string
): void {
    if (mode !== 'signUp') {
        return;
    }

    if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
    }

    if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
    }
}

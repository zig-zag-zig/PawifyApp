import { describe, expect, it } from 'vitest';
import type { User } from 'firebase/auth';

import {
    getSecurityReauthMethod,
    requiresPasswordInput,
    validateSecurityForm,
} from './securityRules';

const userWithProviders = (providerIds: string[], email = 'current@example.test'): User => ({
    email,
    providerData: providerIds.map(providerId => ({ providerId })),
} as User);

describe('security rules', () => {
    it('uses Google reauth for linked Google accounts when the platform supports it', () => {
        const googleAndPassword = userWithProviders(['google.com', 'password']);
        const googleOnly = userWithProviders(['google.com']);
        const passwordOnly = userWithProviders(['password']);

        expect(getSecurityReauthMethod('delete', googleAndPassword, { canUseGoogleAuth: true })).toBe('google');
        expect(getSecurityReauthMethod('delete', googleOnly, { canUseGoogleAuth: true })).toBe('google');
        expect(getSecurityReauthMethod('email', passwordOnly, { canUseGoogleAuth: true })).toBe('password');
        expect(requiresPasswordInput('delete', googleAndPassword, { canUseGoogleAuth: true })).toBe(false);
        expect(requiresPasswordInput('password', googleAndPassword, { canUseGoogleAuth: true })).toBe(true);
    });

    it('falls back to password reauth when Google auth is unavailable on this platform', () => {
        const googleAndPassword = userWithProviders(['google.com', 'password']);
        const googleOnly = userWithProviders(['google.com']);
        const passwordOnly = userWithProviders(['password']);

        expect(getSecurityReauthMethod('delete', googleAndPassword, { canUseGoogleAuth: false })).toBe('password');
        expect(getSecurityReauthMethod('delete', googleOnly, { canUseGoogleAuth: false })).toBeNull();
        expect(getSecurityReauthMethod('email', passwordOnly, { canUseGoogleAuth: false })).toBe('password');
        expect(requiresPasswordInput('delete', googleAndPassword, { canUseGoogleAuth: false })).toBe(true);
        expect(requiresPasswordInput('delete', googleOnly, { canUseGoogleAuth: false })).toBe(false);
        expect(requiresPasswordInput('email', null, { canUseGoogleAuth: false })).toBe(true);
    });

    it('validates email changes without crashing while the current user is still loading', () => {
        expect(validateSecurityForm({
            type: 'email',
            currentPassword: '',
            currentUser: null,
            canUseGoogleAuth: false,
            newValue: '',
            confirmValue: '',
        })).toEqual({
            currentPassword: 'Password is required',
            newValue: 'New email is required',
            confirmValue: 'Please confirm email',
        });
    });

    it('rejects password changes that reuse the current password', () => {
        expect(validateSecurityForm({
            type: 'password',
            currentPassword: 'current-password',
            currentUser: userWithProviders(['password']),
            canUseGoogleAuth: false,
            newValue: 'current-password',
            confirmValue: 'current-password',
        })).toEqual({
            newValue: 'New password must be different',
        });
    });

    it('requires password validation for Google-linked password accounts when Google auth is unavailable', () => {
        expect(validateSecurityForm({
            type: 'delete',
            currentPassword: '',
            currentUser: userWithProviders(['google.com', 'password']),
            canUseGoogleAuth: false,
        })).toEqual({
            currentPassword: 'Password is required',
        });
    });
});

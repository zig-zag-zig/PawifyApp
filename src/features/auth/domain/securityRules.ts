import type { User } from 'firebase/auth';
import type { SecurityActionType, ValidateSecurityOptions } from '../model/types';

type SecurityAuthOptions = {
    canUseGoogleAuth?: boolean;
};

type SecurityReauthMethod = 'google' | 'password';

function hasProvider(user: User, providerId: string): boolean {
    return user.providerData.some(provider => provider.providerId === providerId);
}

export function getSecurityReauthMethod(
    actionType: SecurityActionType,
    user: User | null,
    { canUseGoogleAuth = false }: SecurityAuthOptions = {},
): SecurityReauthMethod | null {
    if (!user) return null;

    const hasGoogle = hasProvider(user, 'google.com');
    const hasPassword = hasProvider(user, 'password');

    if (actionType === 'password') {
        return hasPassword ? 'password' : null;
    }

    if (canUseGoogleAuth && hasGoogle) {
        return 'google';
    }

    return hasPassword ? 'password' : null;
}

export function requiresPasswordInput(
    actionType: SecurityActionType,
    user: User | null,
    options: SecurityAuthOptions = {},
): boolean {
    if (!user) return true;
    return getSecurityReauthMethod(actionType, user, options) === 'password';
}

export function validateSecurityForm({
    type,
    currentPassword,
    currentUser,
    canUseGoogleAuth,
    newValue,
    confirmValue,
}: ValidateSecurityOptions): Record<string, string> {
    const errors: Record<string, string> = {};

    if (requiresPasswordInput(type, currentUser, { canUseGoogleAuth }) && !currentPassword) {
        errors.currentPassword = 'Password is required';
    }

    if (type === 'password') {
        if (!newValue) errors.newValue = 'New password is required';
        else if (newValue.length < 6) errors.newValue = 'Minimum 6 characters';
        if (!confirmValue) errors.confirmValue = 'Please confirm password';
        else if (newValue !== confirmValue) errors.confirmValue = 'Passwords must match';
        if (newValue === currentPassword) errors.newValue = 'New password must be different';
    }

    if (type === 'email') {
        if (!newValue) errors.newValue = 'New email is required';
        else if (!/^\S+@\S+\.\S+$/.test(newValue)) errors.newValue = 'Invalid email format';
        if (!confirmValue) errors.confirmValue = 'Please confirm email';
        else if (newValue !== confirmValue) errors.confirmValue = 'Emails must match';
        if (newValue === currentUser?.email) errors.newValue = 'New email must be different';
    }

    return errors;
}

export const securityButtonTextMap: Record<SecurityActionType, string> = {
    delete: 'Delete Account',
    password: 'Change Password',
    email: 'Change Email',
};

export const securitySuccessMessageMap: Record<SecurityActionType, string> = {
    delete: 'Account deleted successfully!',
    password: 'Password changed successfully!',
    email: 'Email changed successfully!',
};

import type { User } from 'firebase/auth';
import { authCopy } from './authCopy';
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
        errors.currentPassword = authCopy.security.validation.currentPasswordRequired;
    }

    if (type === 'password') {
        if (!newValue) errors.newValue = authCopy.security.validation.newPasswordRequired;
        else if (newValue.length < 6) errors.newValue = authCopy.security.validation.minimumPasswordLength;
        if (!confirmValue) errors.confirmValue = authCopy.security.validation.confirmPassword;
        else if (newValue !== confirmValue) errors.confirmValue = authCopy.security.validation.passwordsMustMatch;
        if (newValue === currentPassword) errors.newValue = authCopy.security.validation.passwordMustChange;
    }

    if (type === 'email') {
        if (!newValue) errors.newValue = authCopy.security.validation.newEmailRequired;
        else if (!/^\S+@\S+\.\S+$/.test(newValue)) errors.newValue = authCopy.security.validation.invalidEmail;
        if (!confirmValue) errors.confirmValue = authCopy.security.validation.confirmEmail;
        else if (newValue !== confirmValue) errors.confirmValue = authCopy.security.validation.emailsMustMatch;
        if (newValue === currentUser?.email) errors.newValue = authCopy.security.validation.emailMustChange;
    }

    return errors;
}

export const securityButtonTextMap: Record<SecurityActionType, string> = {
    delete: authCopy.security.buttonText.delete,
    password: authCopy.security.buttonText.password,
    email: authCopy.security.buttonText.email,
};

export const securitySuccessMessageMap: Record<SecurityActionType, string> = {
    delete: authCopy.security.success.delete,
    password: authCopy.security.success.password,
    email: authCopy.security.success.email,
};

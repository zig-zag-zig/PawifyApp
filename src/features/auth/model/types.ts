import type { User } from 'firebase/auth';

export type AuthMode = 'signIn' | 'signUp';
export type SecurityActionType = 'password' | 'email' | 'delete';

export interface AuthCredentialsState {
    email: string;
    password: string;
    confirmPassword: string;
    isLoading: boolean;
}

export interface ForgotPasswordState {
    email: string;
    otp: string;
    step: 'email' | 'otp';
    isLoading: boolean;
}

export interface ResetPasswordState {
    newPassword: string;
    confirmPassword: string;
    isLoading: boolean;
}

export interface SecurityState {
    currentPassword: string;
    newValue: string;
    confirmValue: string;
    isLoading: boolean;
    isFormDisabled: boolean;
    formErrors: Record<string, string>;
}

export interface ValidateSecurityOptions {
    type: SecurityActionType;
    currentPassword: string;
    currentUser: User | null;
    canUseGoogleAuth?: boolean;
    newValue?: string;
    confirmValue?: string;
}

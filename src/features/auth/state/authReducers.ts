import type { AuthCredentialsState, ForgotPasswordState, ResetPasswordState, SecurityState } from '../model/types';

type AuthCredentialsAction =
    | { type: 'emailChanged'; value: string }
    | { type: 'passwordChanged'; value: string }
    | { type: 'confirmPasswordChanged'; value: string }
    | { type: 'loadingChanged'; value: boolean }
    | { type: 'reset' };

export function createInitialAuthCredentialsState(): AuthCredentialsState {
    return {
        email: '',
        password: '',
        confirmPassword: '',
        isLoading: false,
    };
}

export function authCredentialsReducer(
    state: AuthCredentialsState,
    action: AuthCredentialsAction
): AuthCredentialsState {
    switch (action.type) {
        case 'emailChanged':
            return { ...state, email: action.value };
        case 'passwordChanged':
            return { ...state, password: action.value };
        case 'confirmPasswordChanged':
            return { ...state, confirmPassword: action.value };
        case 'loadingChanged':
            return { ...state, isLoading: action.value };
        case 'reset':
            return createInitialAuthCredentialsState();
        default:
            return state;
    }
}

type ForgotPasswordAction =
    | { type: 'emailChanged'; value: string }
    | { type: 'otpChanged'; value: string }
    | { type: 'stepChanged'; value: 'email' | 'otp' }
    | { type: 'loadingChanged'; value: boolean }
    | { type: 'reset' };

export function createInitialForgotPasswordState(): ForgotPasswordState {
    return {
        email: '',
        otp: '',
        step: 'email',
        isLoading: false,
    };
}

export function forgotPasswordReducer(
    state: ForgotPasswordState,
    action: ForgotPasswordAction
): ForgotPasswordState {
    switch (action.type) {
        case 'emailChanged':
            return { ...state, email: action.value };
        case 'otpChanged':
            return { ...state, otp: action.value };
        case 'stepChanged':
            return { ...state, step: action.value };
        case 'loadingChanged':
            return { ...state, isLoading: action.value };
        case 'reset':
            return createInitialForgotPasswordState();
        default:
            return state;
    }
}

type ResetPasswordAction =
    | { type: 'newPasswordChanged'; value: string }
    | { type: 'confirmPasswordChanged'; value: string }
    | { type: 'loadingChanged'; value: boolean }
    | { type: 'reset' };

export function createInitialResetPasswordState(): ResetPasswordState {
    return {
        newPassword: '',
        confirmPassword: '',
        isLoading: false,
    };
}

export function resetPasswordReducer(
    state: ResetPasswordState,
    action: ResetPasswordAction
): ResetPasswordState {
    switch (action.type) {
        case 'newPasswordChanged':
            return { ...state, newPassword: action.value };
        case 'confirmPasswordChanged':
            return { ...state, confirmPassword: action.value };
        case 'loadingChanged':
            return { ...state, isLoading: action.value };
        case 'reset':
            return createInitialResetPasswordState();
        default:
            return state;
    }
}

type SecurityAction =
    | { type: 'currentPasswordChanged'; value: string }
    | { type: 'newValueChanged'; value: string }
    | { type: 'confirmValueChanged'; value: string }
    | { type: 'loadingChanged'; value: boolean }
    | { type: 'formDisabledChanged'; value: boolean }
    | { type: 'formErrorsChanged'; value: Record<string, string> }
    | { type: 'resetInputs' };

export function createInitialSecurityState(): SecurityState {
    return {
        currentPassword: '',
        newValue: '',
        confirmValue: '',
        isLoading: false,
        isFormDisabled: false,
        formErrors: {},
    };
}

export function securityReducer(
    state: SecurityState,
    action: SecurityAction
): SecurityState {
    switch (action.type) {
        case 'currentPasswordChanged':
            return { ...state, currentPassword: action.value };
        case 'newValueChanged':
            return { ...state, newValue: action.value };
        case 'confirmValueChanged':
            return { ...state, confirmValue: action.value };
        case 'loadingChanged':
            return { ...state, isLoading: action.value };
        case 'formDisabledChanged':
            return { ...state, isFormDisabled: action.value };
        case 'formErrorsChanged':
            return { ...state, formErrors: action.value };
        case 'resetInputs':
            return {
                ...state,
                currentPassword: '',
                newValue: '',
                confirmValue: '',
                isLoading: false,
                formErrors: {},
            };
        default:
            return state;
    }
}

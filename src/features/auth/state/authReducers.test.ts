import { describe, expect, it } from 'vitest';
import {
    authCredentialsReducer,
    createInitialAuthCredentialsState,
    forgotPasswordReducer,
    createInitialForgotPasswordState,
    resetPasswordReducer,
    createInitialResetPasswordState,
    securityReducer,
    createInitialSecurityState,
} from './authReducers';

describe('authCredentialsReducer', () => {
    it('has correct initial state', () => {
        const state = createInitialAuthCredentialsState();
        expect(state).toEqual({ email: '', password: '', confirmPassword: '', isLoading: false });
    });

    it('handles emailChanged', () => {
        const state = authCredentialsReducer(createInitialAuthCredentialsState(), { type: 'emailChanged', value: 'test@test.com' });
        expect(state.email).toBe('test@test.com');
    });

    it('handles passwordChanged', () => {
        const state = authCredentialsReducer(createInitialAuthCredentialsState(), { type: 'passwordChanged', value: 'secret' });
        expect(state.password).toBe('secret');
    });

    it('handles confirmPasswordChanged', () => {
        const state = authCredentialsReducer(createInitialAuthCredentialsState(), { type: 'confirmPasswordChanged', value: 'secret' });
        expect(state.confirmPassword).toBe('secret');
    });

    it('handles loadingChanged', () => {
        const state = authCredentialsReducer(createInitialAuthCredentialsState(), { type: 'loadingChanged', value: true });
        expect(state.isLoading).toBe(true);
    });

    it('handles reset', () => {
        const modified = { email: 'a', password: 'b', confirmPassword: 'c', isLoading: true };
        const state = authCredentialsReducer(modified, { type: 'reset' });
        expect(state).toEqual(createInitialAuthCredentialsState());
    });

    it('returns same state for unknown action', () => {
        const current = createInitialAuthCredentialsState();
        const state = authCredentialsReducer(current, { type: 'unknown' } as any);
        expect(state).toBe(current);
    });
});

describe('forgotPasswordReducer', () => {
    it('has correct initial state', () => {
        const state = createInitialForgotPasswordState();
        expect(state).toEqual({ email: '', otp: '', step: 'email', isLoading: false });
    });

    it('handles emailChanged', () => {
        const state = forgotPasswordReducer(createInitialForgotPasswordState(), { type: 'emailChanged', value: 'test@test.com' });
        expect(state.email).toBe('test@test.com');
    });

    it('handles otpChanged', () => {
        const state = forgotPasswordReducer(createInitialForgotPasswordState(), { type: 'otpChanged', value: '123456' });
        expect(state.otp).toBe('123456');
    });

    it('handles stepChanged', () => {
        const state = forgotPasswordReducer(createInitialForgotPasswordState(), { type: 'stepChanged', value: 'otp' });
        expect(state.step).toBe('otp');
    });

    it('handles loadingChanged', () => {
        const state = forgotPasswordReducer(createInitialForgotPasswordState(), { type: 'loadingChanged', value: true });
        expect(state.isLoading).toBe(true);
    });

    it('handles reset', () => {
        const modified = { email: 'a', otp: 'b', step: 'otp' as const, isLoading: true };
        const state = forgotPasswordReducer(modified, { type: 'reset' });
        expect(state).toEqual(createInitialForgotPasswordState());
    });
});

describe('resetPasswordReducer', () => {
    it('has correct initial state', () => {
        const state = createInitialResetPasswordState();
        expect(state).toEqual({ newPassword: '', confirmPassword: '', isLoading: false });
    });

    it('handles newPasswordChanged', () => {
        const state = resetPasswordReducer(createInitialResetPasswordState(), { type: 'newPasswordChanged', value: 'newpass' });
        expect(state.newPassword).toBe('newpass');
    });

    it('handles confirmPasswordChanged', () => {
        const state = resetPasswordReducer(createInitialResetPasswordState(), { type: 'confirmPasswordChanged', value: 'newpass' });
        expect(state.confirmPassword).toBe('newpass');
    });

    it('handles loadingChanged', () => {
        const state = resetPasswordReducer(createInitialResetPasswordState(), { type: 'loadingChanged', value: true });
        expect(state.isLoading).toBe(true);
    });

    it('handles reset', () => {
        const modified = { newPassword: 'a', confirmPassword: 'b', isLoading: true };
        const state = resetPasswordReducer(modified, { type: 'reset' });
        expect(state).toEqual(createInitialResetPasswordState());
    });
});

describe('securityReducer', () => {
    it('has correct initial state', () => {
        const state = createInitialSecurityState();
        expect(state).toEqual({
            currentPassword: '',
            newValue: '',
            confirmValue: '',
            isLoading: false,
            isFormDisabled: false,
            formErrors: {},
        });
    });

    it('handles currentPasswordChanged', () => {
        const state = securityReducer(createInitialSecurityState(), { type: 'currentPasswordChanged', value: 'pass' });
        expect(state.currentPassword).toBe('pass');
    });

    it('handles newValueChanged', () => {
        const state = securityReducer(createInitialSecurityState(), { type: 'newValueChanged', value: 'new' });
        expect(state.newValue).toBe('new');
    });

    it('handles confirmValueChanged', () => {
        const state = securityReducer(createInitialSecurityState(), { type: 'confirmValueChanged', value: 'confirm' });
        expect(state.confirmValue).toBe('confirm');
    });

    it('handles loadingChanged', () => {
        const state = securityReducer(createInitialSecurityState(), { type: 'loadingChanged', value: true });
        expect(state.isLoading).toBe(true);
    });

    it('handles formDisabledChanged', () => {
        const state = securityReducer(createInitialSecurityState(), { type: 'formDisabledChanged', value: true });
        expect(state.isFormDisabled).toBe(true);
    });

    it('handles formErrorsChanged', () => {
        const errors = { email: 'Invalid email' };
        const state = securityReducer(createInitialSecurityState(), { type: 'formErrorsChanged', value: errors });
        expect(state.formErrors).toEqual(errors);
    });

    it('handles resetInputs', () => {
        const modified = {
            currentPassword: 'a',
            newValue: 'b',
            confirmValue: 'c',
            isLoading: true,
            isFormDisabled: true,
            formErrors: { err: 'msg' },
        };
        const state = securityReducer(modified, { type: 'resetInputs' });
        expect(state.currentPassword).toBe('');
        expect(state.newValue).toBe('');
        expect(state.confirmValue).toBe('');
        expect(state.isLoading).toBe(false);
        expect(state.formErrors).toEqual({});
        // isFormDisabled is NOT reset by resetInputs
        expect(state.isFormDisabled).toBe(true);
    });
});

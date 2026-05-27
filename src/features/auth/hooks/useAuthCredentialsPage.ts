import { useReducer } from 'react';
import { useToast } from '../../../components/ToastContext';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import { useAuthApi } from '../api/authApi';
import { validateAuthCredentials } from '../domain/validateAuthCredentials';
import type { AuthMode } from '../model/types';
import {
    authCredentialsReducer,
    createInitialAuthCredentialsState,
} from '../state/authReducers';

export function useAuthCredentialsPage(mode: AuthMode) {
    const { signIn, signUp } = useAuthApi();
    const { showToast } = useToast();
    const [state, dispatch] = useReducer(
        authCredentialsReducer,
        undefined,
        createInitialAuthCredentialsState
    );

    const handleSubmit = async () => {
        dispatch({ type: 'loadingChanged', value: true });
        try {
            validateAuthCredentials(mode, state.password, state.confirmPassword);
            if (mode === 'signUp') {
                await signUp(state.email.trim(), state.password);
            } else {
                await signIn(state.email.trim(), state.password);
            }
        } catch (error) {
            showToast(
                getUserFacingErrorMessage(
                    error,
                    mode === 'signUp'
                        ? 'Registration failed. Please try again.'
                        : 'Invalid email or password. Please try again.'
                ),
                'error'
            );
        } finally {
            dispatch({ type: 'loadingChanged', value: false });
        }
    };

    return {
        state,
        onEmailChanged: (email: string) => dispatch({ type: 'emailChanged', value: email }),
        onPasswordChanged: (password: string) => dispatch({ type: 'passwordChanged', value: password }),
        onConfirmPasswordChanged: (password: string) => dispatch({ type: 'confirmPasswordChanged', value: password }),
        onSubmit: handleSubmit,
    };
}

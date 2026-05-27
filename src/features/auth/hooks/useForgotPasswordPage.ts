import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useReducer } from 'react';
import { useToast } from '../../../components/ToastContext';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import { ResetPasswordNavigationProp } from '../../../types/navigation';
import { usePublicAuthApi } from '../api/authApi';
import {
    createInitialForgotPasswordState,
    forgotPasswordReducer,
} from '../state/authReducers';

export function useForgotPasswordPage() {
    const navigation = useNavigation<ResetPasswordNavigationProp>();
    const { showToast } = useToast();
    const { sendOtp, verifyOtp } = usePublicAuthApi();
    const [state, dispatch] = useReducer(
        forgotPasswordReducer,
        undefined,
        createInitialForgotPasswordState
    );

    const onSendOtp = async () => {
        dispatch({ type: 'loadingChanged', value: true });
        try {
            await sendOtp(state.email.trim());
            dispatch({ type: 'stepChanged', value: 'otp' });
            showToast('OTP sent to your email. Please enter the code you received.', 'info');
        } catch (error) {
            showToast(
                getUserFacingErrorMessage(error, 'Failed to send OTP. Please check your email and try again.'),
                'error'
            );
        } finally {
            dispatch({ type: 'loadingChanged', value: false });
        }
    };

    const onVerifyOtp = async () => {
        dispatch({ type: 'loadingChanged', value: true });
        try {
            const tempToken = await verifyOtp(state.email.trim(), state.otp.trim());
            navigation.navigate('ResetPassword', { tempToken });
            showToast('OTP verified. Please reset your password.', 'success');
        } catch (error) {
            showToast(
                getUserFacingErrorMessage(error, 'Failed to verify OTP. Please check the code and try again.'),
                'error'
            );
        } finally {
            dispatch({ type: 'loadingChanged', value: false });
        }
    };

    useFocusEffect(
        useCallback(() => {
            return () => {
                dispatch({ type: 'reset' });
            };
        }, [])
    );

    return {
        state,
        onEmailChanged: (email: string) => dispatch({ type: 'emailChanged', value: email }),
        onOtpChanged: (otp: string) => dispatch({ type: 'otpChanged', value: otp }),
        onStepChanged: (step: 'email' | 'otp') => dispatch({ type: 'stepChanged', value: step }),
        onSendOtp,
        onVerifyOtp,
    };
}

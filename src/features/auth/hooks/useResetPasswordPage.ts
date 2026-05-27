import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useReducer } from 'react';
import { signInWithCustomToken, updatePassword } from 'firebase/auth';
import { StackNavigationProp } from '@react-navigation/stack';
import { useToast } from '../../../components/ToastContext';
import { auth } from '../../../firebase/firebaseAuth';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import { RootStackParamList } from '../../../types/navigation';
import { useAuthApi, useTempTokenAuthApi } from '../api/authApi';
import {
    createInitialResetPasswordState,
    resetPasswordReducer,
} from '../state/authReducers';

type ResetPasswordNavigationProp = StackNavigationProp<RootStackParamList, 'ResetPassword'>;

function validateResetPasswordInput(tempToken: string, newPassword: string, confirmPassword: string) {
    if (!tempToken.trim()) throw new Error('Temp token is missing.');
    if (newPassword.length < 6) throw new Error('Password must be at least 6 characters.');
    if (newPassword !== confirmPassword) throw new Error('Passwords do not match.');
}

export function useResetPasswordPage(tempToken: string) {
    const navigation = useNavigation<ResetPasswordNavigationProp>();
    const { showToast } = useToast();
    const { signOut, setLoginWithReauthenticateWithCredential } = useAuthApi();
    const { revokeToken } = useTempTokenAuthApi(tempToken);
    const [state, dispatch] = useReducer(
        resetPasswordReducer,
        undefined,
        createInitialResetPasswordState
    );

    const onResetPassword = async () => {
        dispatch({ type: 'loadingChanged', value: true });
        try {
            validateResetPasswordInput(tempToken, state.newPassword, state.confirmPassword);

            setLoginWithReauthenticateWithCredential(true);
            const userCredential = await signInWithCustomToken(auth, tempToken);
            await updatePassword(userCredential.user, state.newPassword);

            let signedOut = false;
            try {
                await revokeToken();
                await signOut();
                signedOut = true;
            } catch (error) {
                await auth.signOut();
                signedOut = true;
            } finally {
                setLoginWithReauthenticateWithCredential(false);
                if (signedOut) {
                    navigation.navigate('SignIn');
                }
            }

            showToast('Password successfully reset. Please sign in again.', 'success');
        } catch (error) {
            showToast(
                getUserFacingErrorMessage(error, 'Failed to reset password. Please try again.'),
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
        onNewPasswordChanged: (value: string) => dispatch({ type: 'newPasswordChanged', value }),
        onConfirmPasswordChanged: (value: string) => dispatch({ type: 'confirmPasswordChanged', value }),
        onResetPassword,
    };
}

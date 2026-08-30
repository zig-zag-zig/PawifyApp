import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useReducer } from 'react';
import { signInWithCustomToken, updatePassword } from 'firebase/auth';
import { StackNavigationProp } from '@react-navigation/stack';
import { useToast } from '../../../contexts/ToastContext';
import { auth } from '../../../firebase/firebaseAuth';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import { RootStackParamList } from '../../../types/navigation';
import { useAuthApi, useTempTokenAuthApi } from '../api/authApi';
import { authCopy } from '../domain/authCopy';
import {
    createInitialResetPasswordState,
    resetPasswordReducer,
} from '../state/authReducers';

type ResetPasswordNavigationProp = StackNavigationProp<RootStackParamList, 'ResetPassword'>;

function validateResetPasswordInput(tempToken: string, newPassword: string, confirmPassword: string) {
    if (!tempToken.trim()) throw new Error(authCopy.resetPassword.tempTokenMissing);
    if (newPassword.length < 6) throw new Error(authCopy.resetPassword.passwordTooShort);
    if (newPassword !== confirmPassword) throw new Error(authCopy.resetPassword.passwordMismatch);
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

            showToast(authCopy.resetPassword.success, 'success');
        } catch (error) {
            showToast(
                getUserFacingErrorMessage(error, authCopy.resetPassword.failed),
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

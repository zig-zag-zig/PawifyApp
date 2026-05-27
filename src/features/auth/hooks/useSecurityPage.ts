import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { Platform } from 'react-native';
import {
    EmailAuthProvider,
    GoogleAuthProvider,
    reauthenticateWithCredential,
    reauthenticateWithCredential as reauthWithCred,
    updatePassword,
    deleteUser,
} from 'firebase/auth';
import { useCallback, useMemo, useReducer } from 'react';
import { useToast } from '../../../components/ToastContext';
import useGoogleAuth from '../../../hooks/useGoogleAuth';
import { auth } from '../../../firebase/firebaseAuth';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import { RootStackParamList } from '../../../types/navigation';
import { useAuthApi } from '../api/authApi';
import {
    requiresPasswordInput,
    securityButtonTextMap,
    securitySuccessMessageMap,
    validateSecurityForm,
} from '../domain/securityRules';
import type { SecurityActionType } from '../model/types';
import { createInitialSecurityState, securityReducer } from '../state/authReducers';

type SecurityNavigationProp = StackNavigationProp<RootStackParamList, 'Security'>;

async function deleteAccount(deleteUserAccount: () => Promise<string>) {
    if (!auth.currentUser) return false;

    await deleteUserAccount();
    await deleteUser(auth.currentUser);
    return true;
}

export function useSecurityPage(actionType: SecurityActionType) {
    const navigation = useNavigation<SecurityNavigationProp>();
    const { showToast } = useToast();
    const {
        user,
        signOut,
        setLoginWithReauthenticateWithCredential,
        revokeToken,
        deleteUserAccount,
        changeEmail,
    } = useAuthApi();
    const [state, dispatch] = useReducer(
        securityReducer,
        undefined,
        createInitialSecurityState
    );

    const needsPasswordField = useMemo(() => {
        return requiresPasswordInput(actionType, user);
    }, [actionType, user]);

    useFocusEffect(
        useCallback(() => {
            if (actionType === 'password' && !user?.providerData?.some(provider => provider.providerId === 'password')) {
                showToast('Password change not available for your sign-in method.', 'error');
                navigation.goBack && navigation.goBack();
                return () => { };
            }

            if (actionType === 'email' && user?.providerData?.some(provider => provider.providerId === 'google.com')) {
                dispatch({ type: 'formDisabledChanged', value: true });
                showToast(
                    'Email change not available when Google account is linked. To change email: unlink Google, update email, then re-link Google.',
                    'error'
                );
                return () => { };
            }

            dispatch({ type: 'formDisabledChanged', value: false });

            return () => {
                dispatch({ type: 'resetInputs' });
            };
        }, [actionType, navigation, showToast, user])
    );

    const executeSecurityAction = async () => {
        const currentUser = auth.currentUser;
        if (!currentUser || !currentUser.email) {
            throw new Error('User not authenticated');
        }

        const errors = validateSecurityForm({
            type: actionType,
            currentPassword: state.currentPassword,
            currentUser,
            newValue: state.newValue,
            confirmValue: actionType !== 'delete' ? state.confirmValue : undefined,
        });
        dispatch({ type: 'formErrorsChanged', value: errors });
        if (Object.keys(errors).length > 0) {
            return { success: false, requiresSignout: false };
        }

        setLoginWithReauthenticateWithCredential(true);

        const hasGoogle = currentUser.providerData.some(provider => provider.providerId === 'google.com');
        const hasPassword = currentUser.providerData.some(provider => provider.providerId === 'password');
        const canUseGoogleAuth = Platform.OS === 'android';

        const shouldUseGoogleAuth = canUseGoogleAuth && hasGoogle && actionType !== 'password';
        const shouldUsePasswordAuth =
            (actionType === 'password' && hasPassword) ||
            ((!hasGoogle || !canUseGoogleAuth) && hasPassword);

        if (shouldUseGoogleAuth) {
            try {
                const result = await useGoogleAuth.signInWithGoogle();
                const idToken = result?.idToken;
                if (!idToken) {
                    return { success: false, requiresSignout: true };
                }
                const credential = GoogleAuthProvider.credential(idToken);
                await reauthWithCred(currentUser, credential);
            } catch (error) {
                return { success: false, requiresSignout: true };
            }
        } else if (shouldUsePasswordAuth) {
            const credential = EmailAuthProvider.credential(currentUser.email, state.currentPassword);
            await reauthenticateWithCredential(currentUser, credential);
        } else {
            throw new Error('No suitable authentication method available');
        }

        let success = false;

        if (actionType === 'password') {
            await updatePassword(currentUser, state.newValue);
            success = true;
        } else if (actionType === 'email' && !hasGoogle) {
            await changeEmail(state.newValue);
            success = true;
        } else if (actionType === 'delete') {
            success = await deleteAccount(deleteUserAccount);
        }

        if (success) {
            await revokeToken();
        }

        return {
            success,
            requiresSignout: success,
        };
    };

    const onSubmit = async () => {
        dispatch({ type: 'loadingChanged', value: true });
        let requiresSignout = false;

        try {
            const result = await executeSecurityAction();
            requiresSignout = result.requiresSignout;

            if (result.success) {
                showToast(securitySuccessMessageMap[actionType], 'success');
            }
        } catch (error: any) {
            if (error?.code === 'auth/invalid-credential') {
                dispatch({
                    type: 'formErrorsChanged',
                    value: { currentPassword: 'Incorrect password' },
                });
            } else if (error?.code === 'auth/requires-recent-login') {
                requiresSignout = true;
            } else {
                showToast(
                    getUserFacingErrorMessage(error, `Failed to ${securityButtonTextMap[actionType].toLowerCase()}`),
                    'error'
                );
            }
        } finally {
            setLoginWithReauthenticateWithCredential(false);
            if (requiresSignout) {
                await signOut();
            }
            dispatch({ type: 'loadingChanged', value: false });
        }
    };

    return {
        state,
        needsPasswordField,
        buttonText: securityButtonTextMap[actionType],
        onCurrentPasswordChanged: (value: string) => dispatch({ type: 'currentPasswordChanged', value }),
        onNewValueChanged: (value: string) => dispatch({ type: 'newValueChanged', value }),
        onConfirmValueChanged: (value: string) => dispatch({ type: 'confirmValueChanged', value }),
        onSubmit,
    };
}

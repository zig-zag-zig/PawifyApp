import { useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useBackend } from '../../../hooks/useBackend';

export function useAuthApi() {
    const auth = useAuth();
    const backend = useBackend(auth.getAccessToken);

    return {
        user: auth.user,
        signIn: auth.signIn,
        signUp: auth.signUp,
        signOut: auth.signOut,
        setLoginWithReauthenticateWithCredential: auth.setLoginWithReauthenticateWithCredential,
        revokeToken: backend.revokeToken,
        deleteUserAccount: backend.deleteUserAccount,
        changeEmail: backend.changeEmail,
    };
}

export function usePublicAuthApi() {
    const getAnonymousToken = useCallback(async () => '', []);
    const backend = useBackend(getAnonymousToken);

    return {
        sendOtp: backend.sendOtp,
        verifyOtp: backend.verifyOtp,
    };
}

export function useTempTokenAuthApi(tempToken: string) {
    const getTempToken = useCallback(async () => tempToken, [tempToken]);
    const backend = useBackend(getTempToken);

    return {
        revokeToken: backend.revokeToken,
    };
}

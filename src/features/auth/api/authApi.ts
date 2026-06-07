import { useCallback, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useApiClient } from '../../../hooks/useApiClient';

export function useAuthApi() {
    const auth = useAuth();
    const apiClient = useApiClient(auth.getAccessToken);

    return useMemo(() => ({
        user: auth.user,
        signIn: auth.signIn,
        signUp: auth.signUp,
        signOut: auth.signOut,
        setLoginWithReauthenticateWithCredential: auth.setLoginWithReauthenticateWithCredential,
        revokeToken: async () => await apiClient.request<string>('revokeToken', { method: 'GET' }),
        deleteUserAccount: async () => await apiClient.request<string>('deleteUserAccount'),
        changeEmail: async (email: string) => await apiClient.request<string>('changeEmail', {
            body: { email },
        }),
    }), [apiClient, auth]);
}

export function usePublicAuthApi() {
    const getAnonymousToken = useCallback(async () => '', []);
    const apiClient = useApiClient(getAnonymousToken);

    return useMemo(() => ({
        sendOtp: async (email: string) => await apiClient.request<string>('sendOtp', {
            body: { email },
            requiresAuth: false,
        }),
        verifyOtp: async (email: string, otp: string) => await apiClient.request<string>('verifyOtp', {
            body: { email, otp },
            requiresAuth: false,
        }),
    }), [apiClient]);
}

export function useTempTokenAuthApi(tempToken: string) {
    const getTempToken = useCallback(async () => tempToken, [tempToken]);
    const apiClient = useApiClient(getTempToken);

    return useMemo(() => ({
        revokeToken: async () => await apiClient.request<string>('revokeToken', { method: 'GET' }),
    }), [apiClient]);
}

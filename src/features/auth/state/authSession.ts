import {
  signOut as firebaseSignOut,
  onIdTokenChanged,
  User,
} from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../../../firebase/firebaseAuth';
import { useApiClient } from '../../../hooks/useApiClient';
import { useOnAppForeground } from '../../../hooks/useOnAppForeground';
import { useRegisterForPushNotifications } from '../../../hooks/useRegisterForPushNotifications';
import { shouldRunForegroundRefresh } from '../../../utils/foregroundRefreshPolicy';
import { signOutGoogleProvider } from '../services/authProviderLinkingService';
import {
  cleanupPostAuthDevice,
  registerPostAuthDevice,
  type CleanupPostAuthDeviceOptions,
} from '../services/postAuthSetupService';
import { createAuthCommands } from './authCommands';
import { getFirebaseAccessToken } from './authToken';
import { createPushTokenApi } from './pushTokenApi';

export type SkipRemotePushTokenCleanupOption = Pick<CleanupPostAuthDeviceOptions, 'skipRemotePushTokenCleanup'>;

export type AuthSessionValue = {
  user: User | null;
  authCompleted: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  linkPassword: (email: string, password: string) => Promise<void>;
  unlinkProvider: (providerId: string) => Promise<void>;
  signOut: (options?: SkipRemotePushTokenCleanupOption) => Promise<void>;
  getAccessToken: (forceRefresh?: boolean) => Promise<string>;
  setLoginWithReauthenticateWithCredential: (value: boolean) => void;
};

/**
 * Owns the Firebase session: user/authCompleted state, token retrieval,
 * foreground refresh policy, post-auth device registration, and sign-out.
 * Provider-agnostic so AuthContext stays a thin shell.
 */
export function useAuthSession(): AuthSessionValue {
  const [authCompleted, setAuthCompleted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const loginWithReauthenticateWithCredentialRef = useRef(false);
  const signOutRef = useRef<(() => Promise<void>) | null>(null);
  const signingOutRef = useRef(false);

  const setLoginWithReauthenticateWithCredential = (value: boolean) => {
    loginWithReauthenticateWithCredentialRef.current = value;
  };

  const getAccessToken = useCallback(async (forceRefresh = false): Promise<string> => {
    return getFirebaseAccessToken(forceRefresh);
  }, []);
  const handleAuthFailure = useCallback(() => {
    // Hard token failure (expired/revoked): end the session. signOut is
    // re-entrancy guarded, so cleanup calls that fail here cannot loop.
    void signOutRef.current?.();
  }, []);
  const apiClient = useApiClient(getAccessToken, handleAuthFailure);
  const { savePushToken, deletePushToken } = useMemo(
    () => createPushTokenApi(apiClient),
    [apiClient],
  );
  const { registerForPushNotificationsAsync } = useRegisterForPushNotifications();

  const refreshCurrentUserToken = useCallback(async () => {
    try {
      if (auth.currentUser) {
        await getAccessToken(true);
        setUser(prev => (prev?.uid === auth.currentUser?.uid ? prev : auth.currentUser));
      }
    } catch (error) {
      console.warn('auth: foreground token refresh failed', error);
    }
  }, [getAccessToken]);

  useOnAppForeground(({ inactiveMs }) => {
    if (!auth.currentUser || !shouldRunForegroundRefresh(inactiveMs)) {
      return;
    }

    void refreshCurrentUserToken();
  });

  useEffect(() => {
    const unsubscribeAuth = onIdTokenChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
      }
      else {
        const skipPostAuthSetup = loginWithReauthenticateWithCredentialRef.current;
        // Always consume the gate: a failed link/reauth flow must not leave it
        // stuck, or every later token change would skip post-auth setup.
        loginWithReauthenticateWithCredentialRef.current = false;
        if (!skipPostAuthSetup) {
          try {
            await getAccessToken();
            setUser(prev => (prev?.uid === currentUser.uid ? prev : currentUser));
            await registerPostAuthDevice(registerForPushNotificationsAsync, savePushToken);
          } catch (error) {
            console.error('auth: post-auth setup failed', error);
          }
        }
      }
      setAuthCompleted(true);
    });

    return () => {
      unsubscribeAuth();
    };
  }, [getAccessToken, registerForPushNotificationsAsync, savePushToken]);

  const commands = useMemo(() => createAuthCommands(setUser), [setUser]);

  const signOut = useCallback(async (options?: SkipRemotePushTokenCleanupOption) => {
    if (signingOutRef.current) {
      return;
    }
    signingOutRef.current = true;
    try {
      await cleanupPostAuthDevice(deletePushToken, {
        skipRemotePushTokenCleanup: options?.skipRemotePushTokenCleanup ?? false,
      });
      setUser(null);
      try {
        await signOutGoogleProvider();
      } catch {
        // Native Google sign-out is best effort; Firebase sign-out is authoritative.
      }
      await firebaseSignOut(auth);
    } finally {
      signingOutRef.current = false;
    }
  }, [deletePushToken]);

  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  return {
    authCompleted,
    user,
    getAccessToken,
    signUp: commands.signUp,
    signIn: commands.signIn,
    signOut,
    signInWithGoogle: commands.signInWithGoogle,
    linkGoogle: commands.linkGoogle,
    linkPassword: commands.linkPassword,
    unlinkProvider: commands.unlinkProvider,
    setLoginWithReauthenticateWithCredential,
  };
}

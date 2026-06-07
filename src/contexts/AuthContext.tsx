import {
  signOut as firebaseSignOut,
  onIdTokenChanged,
  User
} from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { auth } from '../firebase/firebaseAuth';
import {
  linkGoogleProvider,
  linkPasswordProvider,
  signInWithGoogleProvider,
  signOutGoogleProvider,
  unlinkAuthProvider,
} from '../features/auth/services/authProviderLinkingService';
import {
  signInWithEmail,
  signUpWithEmail,
} from '../features/auth/services/firebaseCredentialService';
import {
  cleanupPostAuthDevice,
  registerPostAuthDevice,
} from '../features/auth/services/postAuthSetupService';
import { useApiClient } from '../hooks/useApiClient';
import { useOnAppForeground } from '../hooks/useOnAppForeground';
import { useRegisterForPushNotifications } from '../hooks/useRegisterForPushNotifications';

interface AuthContextType {
  user: User | null;
  authCompleted: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  linkPassword: (email: string, password: string) => Promise<void>;
  unlinkProvider: (providerId: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: (forceRefresh?: boolean) => Promise<string>;
  setLoginWithReauthenticateWithCredential: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const authForegroundRefreshMinInactiveMs = 5 * 60 * 1000;

function shouldRunForegroundTokenRefresh(inactiveMs: number | null) {
  return inactiveMs === null || inactiveMs >= authForegroundRefreshMinInactiveMs;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [authCompleted, setAuthCompleted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const loginWithReauthenticateWithCredentialRef = useRef(false);
  const signOutRef = useRef<(() => Promise<void>) | null>(null);

  const setLoginWithReauthenticateWithCredential = (value: boolean) => {
    loginWithReauthenticateWithCredentialRef.current = value;
  };

  const getAccessToken = useCallback(async (forceRefresh = false): Promise<string> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User not signed in');
    }

    try {
      return await currentUser.getIdToken(forceRefresh);
    } catch (error) {
      console.error('auth: get access token failed', error);
      if (signOutRef.current) {
        await signOutRef.current();
      }
      throw new Error('Authentication failed. Please sign in again.');
    }
  }, []);
  const apiClient = useApiClient(getAccessToken);
  const savePushToken = useCallback(async (pushToken: string) => {
    await apiClient.request<string>('savePushToken', {
      body: { pushToken, deviceId: await apiClient.getDeviceId() },
    });
    return pushToken;
  }, [apiClient]);
  const deletePushToken = useCallback(async () =>
    await apiClient.request<string>('deletePushToken', {
      body: { deviceId: await apiClient.getDeviceId() },
    }), [apiClient]);
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
    if (!auth.currentUser || !shouldRunForegroundTokenRefresh(inactiveMs)) {
      return;
    }

    void refreshCurrentUserToken();
  });

  useEffect(() => {
    const unsubscribeAuth = onIdTokenChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
      }
      else if (!loginWithReauthenticateWithCredentialRef.current) {
        try {
          await getAccessToken();
          setUser(prev => (prev?.uid === currentUser.uid ? prev : currentUser));
          await registerPostAuthDevice(registerForPushNotificationsAsync, savePushToken);
        } catch (error) {
          console.error('auth: post-auth setup failed', error);
        }
      }
      setAuthCompleted(true);
    });

    return () => {
      unsubscribeAuth();
    };
  }, [getAccessToken, registerForPushNotificationsAsync, savePushToken]);

  const signUp = useCallback(async (email: string, password: string) => {
    await signUpWithEmail(email, password);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmail(email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithGoogleProvider();
  }, []);

  const linkGoogle = useCallback(async () => {
    setUser(await linkGoogleProvider());
  }, []);

  const linkPassword = useCallback(async (email: string, password: string) => {
    setUser(await linkPasswordProvider(email, password));
  }, []);

  const unlinkProvider = useCallback(async (providerId: string) => {
    setUser(await unlinkAuthProvider(providerId));
  }, []);

  const signOut = useCallback(async () => {
    await cleanupPostAuthDevice(deletePushToken);
    setUser(null);
    try {
      await signOutGoogleProvider();
    } catch {
      // Native Google sign-out is best effort; Firebase sign-out is authoritative.
    }
    await firebaseSignOut(auth);
  }, [deletePushToken]);

  useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  return (
    <AuthContext.Provider value={{
      authCompleted,
      user,
      getAccessToken,
      signUp,
      signIn,
      signOut,
      signInWithGoogle,
      linkGoogle,
      linkPassword,
      unlinkProvider,
      setLoginWithReauthenticateWithCredential,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

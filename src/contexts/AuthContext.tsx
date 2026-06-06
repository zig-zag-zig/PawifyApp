import {
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  User
} from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import useGoogleAuth, { getGoogleSignInErrorCode } from '../hooks/useGoogleAuth';
import { Platform } from 'react-native';
import { auth } from '../firebase/firebaseAuth';
import { useBackend } from '../hooks/useBackend';
import { useOnAppForeground } from '../hooks/useOnAppForeground';
import { useRegisterForPushNotifications } from '../hooks/useRegisterForPushNotifications';
import { EventService } from '../services/eventService';
import { getStoredPushToken, removeStoredPushToken } from '../services/pushTokenStorage';
import { getUserFacingErrorMessage } from '../services/userFacingErrors';

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

type ErrorWithCode = Error & {
  code?: string;
  cause?: unknown;
};

function shouldRunForegroundTokenRefresh(inactiveMs: number | null) {
  return inactiveMs === null || inactiveMs >= authForegroundRefreshMinInactiveMs;
}

function createUserFacingAuthError(error: unknown, fallback: string): ErrorWithCode {
  const wrappedError = new Error(getUserFacingErrorMessage(error, fallback)) as ErrorWithCode;
  const code = getGoogleSignInErrorCode(error);
  if (code) {
    wrappedError.code = code;
  }
  wrappedError.cause = error;
  return wrappedError;
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
  const { deletePushToken, savePushToken } = useBackend(getAccessToken);
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
          await registerForPushNotificationsAsync(savePushToken);
        } catch (error) {
          console.error('auth: post-auth setup failed', error);
        }
      }
      setAuthCompleted(true);
    });

    return () => {
      unsubscribeAuth();
    };
  }, [deletePushToken, getAccessToken, registerForPushNotificationsAsync, savePushToken]);

  const signUp = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw new Error(getUserFacingErrorMessage(error, 'Registration failed. Please try again.'));
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw new Error(getUserFacingErrorMessage(error, 'Invalid email or password. Please try again.'));
    }
  };

  const signInWithGoogle = async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const res = await useGoogleAuth.signInWithGoogle();
      const idToken = res?.idToken;
      if (!idToken) {
        throw new Error('No idToken returned from native Google sign-in');
      }
      // lazy import to avoid breaking web builds
      const { signInWithCredential, GoogleAuthProvider } = await import('firebase/auth');
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } catch (error) {
      throw createUserFacingAuthError(error, 'Google sign-in failed. Please try again.');
    }
  };

  const linkGoogle = async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No current user');
    const res = await useGoogleAuth.signInWithGoogle();
    const idToken = res?.idToken;
    if (!idToken) throw new Error('No idToken returned');
    const { GoogleAuthProvider, linkWithCredential } = await import('firebase/auth');
    const cred = GoogleAuthProvider.credential(idToken);
    await linkWithCredential(currentUser, cred);
    await reloadCurrentUser(currentUser);
  };

  const linkPassword = async (email: string, password: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No current user');
    const { EmailAuthProvider, linkWithCredential } = await import('firebase/auth');
    const cred = EmailAuthProvider.credential(email, password);
    await linkWithCredential(currentUser, cred);
    await reloadCurrentUser(currentUser);
  };

  const reloadCurrentUser = async (currentUser: User) => {
    try {
      await currentUser.reload();
      setUser(auth.currentUser);
    } catch (e) {
      console.warn('auth: reload user failed', e);
    }
  };

  const unlinkProvider = async (providerId: string) => {
    if (providerId === 'google.com' && Platform.OS !== 'android') {
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No current user');
    // Prevent unlinking the last provider: user must have at least one sign-in method
    const providers = currentUser.providerData || [];
    if (providers.length <= 1) {
      throw new Error('Cannot unlink the only sign-in provider. Add another sign-in method first.');
    }

    const { unlink } = await import('firebase/auth');
    await unlink(currentUser, providerId);
    await reloadCurrentUser(currentUser);
  };

  const signOut = async () => {
    try {
      try {
        await deletePushToken();
      } catch (error) {
        console.warn('auth: push token cleanup failed', error);
      }
      await removeStoredPushToken();
    } catch (error) {
      console.error('auth: sign-out failed', error);
    } finally {
      EventService.setClientPushToken(null);
      setUser(null);
      // try native google sign out as well
      try {
        await useGoogleAuth.signOutGoogle();
      } catch (e) {
        // ignore
      }
      await firebaseSignOut(auth);
    }
  };

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

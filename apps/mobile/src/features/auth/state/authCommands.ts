import type { User } from 'firebase/auth';
import {
  linkGoogleProvider,
  linkPasswordProvider,
  signInWithGoogleProvider,
  unlinkAuthProvider,
} from '../services/authProviderLinkingService';
import {
  signInWithEmail,
  signUpWithEmail,
} from '../services/firebaseCredentialService';

export type AuthCommands = {
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  linkGoogle: () => Promise<void>;
  linkPassword: (email: string, password: string) => Promise<void>;
  unlinkProvider: (providerId: string) => Promise<void>;
};

/**
 * Session commands. `setUser` is applied by link/unlink flows whose result is
 * already the new Firebase user; email sign-in/sign-up rely on the
 * onIdTokenChanged listener instead.
 */
export function createAuthCommands(setUser: (user: User | null) => void): AuthCommands {
  return {
    signUp: async (email: string, password: string) => {
      await signUpWithEmail(email, password);
    },
    signIn: async (email: string, password: string) => {
      await signInWithEmail(email, password);
    },
    signInWithGoogle: async () => {
      await signInWithGoogleProvider();
    },
    linkGoogle: async () => {
      setUser(await linkGoogleProvider());
    },
    linkPassword: async (email: string, password: string) => {
      setUser(await linkPasswordProvider(email, password));
    },
    unlinkProvider: async (providerId: string) => {
      setUser(await unlinkAuthProvider(providerId));
    },
  };
}

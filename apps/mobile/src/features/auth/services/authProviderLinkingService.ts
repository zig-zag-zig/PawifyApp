import type { User } from 'firebase/auth';
import { Platform } from 'react-native';
import useGoogleAuth, { getGoogleSignInErrorCode } from '../hooks/useGoogleAuth';
import { auth } from '../../../firebase/firebaseAuth';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';

type ErrorWithCode = Error & {
  code?: string;
  cause?: unknown;
};

function createUserFacingAuthError(error: unknown, fallback: string): ErrorWithCode {
  const wrappedError = new Error(getUserFacingErrorMessage(error, fallback)) as ErrorWithCode;
  const code = getGoogleSignInErrorCode(error);
  if (code) {
    wrappedError.code = code;
  }
  wrappedError.cause = error;
  return wrappedError;
}

async function getGoogleIdToken(): Promise<string> {
  const res = await useGoogleAuth.signInWithGoogle();
  const idToken = res?.idToken;
  if (!idToken) {
    throw new Error('No idToken returned from native Google sign-in');
  }

  return idToken;
}

export async function reloadFirebaseUser(currentUser: User): Promise<User | null> {
  await currentUser.reload();
  return auth.currentUser;
}

export async function signInWithGoogleProvider(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    const idToken = await getGoogleIdToken();
    const { signInWithCredential, GoogleAuthProvider } = await import('firebase/auth');
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
  } catch (error) {
    throw createUserFacingAuthError(error, 'Google sign-in failed. Please try again.');
  }
}

export async function linkGoogleProvider(): Promise<User | null> {
  if (Platform.OS !== 'android') {
    return auth.currentUser;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('No current user');
  const idToken = await getGoogleIdToken();
  const { GoogleAuthProvider, linkWithCredential } = await import('firebase/auth');
  const cred = GoogleAuthProvider.credential(idToken);
  await linkWithCredential(currentUser, cred);
  return await reloadFirebaseUser(currentUser);
}

export async function linkPasswordProvider(email: string, password: string): Promise<User | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('No current user');
  const { EmailAuthProvider, linkWithCredential } = await import('firebase/auth');
  const cred = EmailAuthProvider.credential(email, password);
  await linkWithCredential(currentUser, cred);
  return await reloadFirebaseUser(currentUser);
}

export async function unlinkAuthProvider(providerId: string): Promise<User | null> {
  if (providerId === 'google.com' && Platform.OS !== 'android') {
    return auth.currentUser;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('No current user');
  const providers = currentUser.providerData || [];
  if (providers.length <= 1) {
    throw new Error('Cannot unlink the only sign-in provider. Add another sign-in method first.');
  }

  const { unlink } = await import('firebase/auth');
  await unlink(currentUser, providerId);
  return await reloadFirebaseUser(currentUser);
}

export async function signOutGoogleProvider(): Promise<void> {
  await useGoogleAuth.signOutGoogle();
}

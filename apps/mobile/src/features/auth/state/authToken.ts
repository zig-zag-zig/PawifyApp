import { auth } from '../../../firebase/firebaseAuth';

/**
 * Thrown when a Firebase access token cannot be obtained. Carries the
 * Firebase error code (e.g. `auth/network-request-failed`, `auth/user-token-expired`)
 * so callers can decide between transient retry and session expiry.
 */
export class AuthTokenError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthTokenError';
    this.code = code;
  }
}

/**
 * Obtains a Firebase access token for the current user. Never triggers side
 * effects (sign-out, cleanup): session-expiry decisions belong to the caller.
 */
export async function getFirebaseAccessToken(forceRefresh = false): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new AuthTokenError('User not signed in');
  }

  try {
    return await currentUser.getIdToken(forceRefresh);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    console.error('auth: get access token failed', code ?? error);
    throw new AuthTokenError('Authentication failed. Please sign in again.', code);
  }
}

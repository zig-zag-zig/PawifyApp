import {
  getUserFacingErrorMessage as getApiUserFacingErrorMessage,
  isApiCallError,
} from './apiErrors';

const defaultErrorMessage = 'Something went wrong. Please try again.';

const firebaseAuthMessages: Record<string, string> = {
  'auth/credential-already-in-use': 'This sign-in method is already linked to another account.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/requires-recent-login': 'Please sign in again before making this change.',
  'auth/too-many-requests': 'Too many attempts. Please wait a bit and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'Invalid email or password.',
  'auth/weak-password': 'Password must be at least 6 characters long.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/network-request-failed': 'Network request failed. Check your connection and try again.',
  'auth/provider-already-linked': 'This sign-in method is already linked to your account.',
  NO_ACTIVITY: 'Google sign-in is not ready yet. Please try again.',
  NOT_INITIALIZED: 'Google sign-in is not available in this build.',
  SIGNIN_IN_PROGRESS: 'Google sign-in is already in progress.',
  USER_CANCELLED: 'Google sign-in was cancelled.',
  NO_CREDENTIAL: 'No Google account is available on this device. Add a Google account and try again.',
  PROVIDER_CONFIGURATION_ERROR: 'Google sign-in is not configured for this Android build. Check Firebase SHA fingerprints.',
  UNSUPPORTED_DEVICE: 'Google sign-in is not supported on this device.',
  SIGNIN_INTERRUPTED: 'Google sign-in was interrupted. Please try again.',
  UNSUPPORTED_CREDENTIAL: 'Google sign-in returned an unsupported credential.',
  MISSING_ID_TOKEN: 'Google sign-in did not return an ID token.',
  INVALID_ID_TOKEN: 'Google sign-in returned an invalid ID token.',
  SIGNIN_FAILED: 'Google sign-in failed. Please try again.',
};

const friendlyMessagePatterns = [
  /^cannot unlink/i,
  /^email change not available/i,
  /^google sign-in/i,
  /^invalid email or password/i,
  /^invalid otp$/i,
  /^network request failed/i,
  /^otp expired$/i,
  /^password/i,
  /^please /i,
  /^request failed \(\d+\)/i,
  /^something went wrong/i,
  /^the requested item was not found/i,
  /^user not authenticated$/i,
  /^wrong otp/i,
];

const internalMessagePatterns = [
  /firebase:/i,
  /\bauth\//i,
  /googlesigninmodule/i,
  /http error/i,
  /\bidtoken\b/i,
  /native module/i,
  /no current user/i,
  /stack trace/i,
  /temp token/i,
];

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};

const isFriendlyMessage = (message: string): boolean => {
  return friendlyMessagePatterns.some(pattern => pattern.test(message));
};

const isInternalMessage = (message: string): boolean => {
  return internalMessagePatterns.some(pattern => pattern.test(message));
};

export const getUserFacingErrorMessage = (
  error: unknown,
  fallback = defaultErrorMessage,
): string => {
  if (isApiCallError(error)) {
    return getApiUserFacingErrorMessage(error, fallback);
  }

  const code = getErrorCode(error);
  if (code && firebaseAuthMessages[code]) {
    return firebaseAuthMessages[code];
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && isFriendlyMessage(message) && !isInternalMessage(message)) {
      return message;
    }
  }

  return fallback;
};

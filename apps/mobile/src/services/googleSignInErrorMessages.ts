export const googleSignInErrorMessages: Record<string, string> = {
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

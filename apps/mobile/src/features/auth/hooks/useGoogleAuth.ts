import { NativeModules, Platform } from 'react-native';
import { ENV } from '../../../config/env';
import { googleSignInErrorMessages } from '../../../services/googleSignInErrorMessages';

const { GoogleSignInModule } = NativeModules as any;

type GoogleAuthResult = {
    idToken: string | null;
    accessToken: string | null;
    email?: string | null;
    name?: string | null;
    providerId?: string | null;
};

const isAndroid = Platform.OS === 'android';
const clientId = ENV.googleWebClientId;

const unavailableMessage = 'Google sign-in is not available in this build.';
const failedMessage = 'Google sign-in failed. Please try again.';

type ErrorWithCode = Error & {
    code?: string;
    cause?: unknown;
};

export function getGoogleSignInErrorCode(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
        return undefined;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
}

export function isGoogleSignInCancellation(error: unknown): boolean {
    const code = getGoogleSignInErrorCode(error);
    if (code === 'USER_CANCELLED') {
        return true;
    }

    return error instanceof Error && /google sign-in was cancelled/i.test(error.message);
}

function createGoogleSignInError(error: unknown, fallback = failedMessage): ErrorWithCode {
    const code = getGoogleSignInErrorCode(error);
    const message = code ? googleSignInErrorMessages[code] ?? fallback : fallback;
    const normalizedError = new Error(message) as ErrorWithCode;

    if (code) {
        normalizedError.code = code;
    }

    normalizedError.cause = error;
    return normalizedError;
}

async function signInWithGoogle(): Promise<GoogleAuthResult> {
    if (!isAndroid) {
        return {
            idToken: null,
            accessToken: null,
            providerId: 'google.com',
        };
    }

    if (!GoogleSignInModule || !GoogleSignInModule.init || !GoogleSignInModule.signIn) {
        console.warn('google-auth: native module unavailable', {
            hasModule: Boolean(GoogleSignInModule),
            hasInit: Boolean(GoogleSignInModule?.init),
            hasSignIn: Boolean(GoogleSignInModule?.signIn),
        });
        throw new Error(unavailableMessage);
    }

    try {
        await GoogleSignInModule.init(clientId);
    } catch (e) {
        console.warn('google-auth: initialization failed', e);
        throw createGoogleSignInError(e);
    }

    try {
        const result = await GoogleSignInModule.signIn();

        if (!result) {
            throw new Error(failedMessage);
        }

        if (!result.idToken) {
            const missingTokenError = new Error('Google sign-in did not return an ID token.') as ErrorWithCode;
            missingTokenError.code = 'MISSING_ID_TOKEN';
            throw missingTokenError;
        }

        return result;
    } catch (e) {
        const error = createGoogleSignInError(e);
        if (!isGoogleSignInCancellation(error)) {
            console.warn('google-auth: sign-in failed', {
                code: error.code,
                message: error.message,
                nativeError: e,
            });
        }
        throw error;
    }
}

async function signOutGoogle(): Promise<void> {
    if (!isAndroid) {
        return;
    }

    if (!GoogleSignInModule || !GoogleSignInModule.signOut) {
        console.warn('google-auth: google sign-out skipped (native module unavailable)');
        return;
    }

    try {
        await GoogleSignInModule.signOut();
    } catch (e) {
        console.error('google-auth: google sign-out failed', e);
    }
}

export default {
    signInWithGoogle,
    signOutGoogle,
};

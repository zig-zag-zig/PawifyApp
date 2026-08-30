// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const tokenListeners = new Set<(user: unknown) => void>();
    const firebaseUser = { uid: 'user-1', providerData: [], getIdToken: vi.fn(async () => 'token-1') };
    return {
        tokenListeners,
        firebaseUser,
        auth: {
            currentUser: firebaseUser as unknown,
            onIdTokenChanged: vi.fn((_auth: unknown, cb: (user: unknown) => void) => {
                tokenListeners.add(cb);
                return () => tokenListeners.delete(cb);
            }),
        },
        firebaseSignOut: vi.fn(async () => { }),
        registerPostAuthDevice: vi.fn(async () => { }),
        cleanupPostAuthDevice: vi.fn(async () => { }),
        signOutGoogleProvider: vi.fn(async () => { }),
        registerForPushNotificationsAsync: vi.fn(async () => { }),
        emitTokenChange: (user: unknown) => {
            mocks.auth.currentUser = user;
            tokenListeners.forEach(cb => cb(user));
        },
    };
});

vi.mock('firebase/auth', () => ({
    signOut: mocks.firebaseSignOut,
    onIdTokenChanged: mocks.auth.onIdTokenChanged,
}));

vi.mock('react-native', () => ({
    AppState: {
        currentState: 'active',
        addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Platform: { OS: 'android' },
}));

vi.mock('react-native-device-info', () => ({
    getUniqueId: vi.fn(async () => 'device-1'),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {},
}));

vi.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.0.0' } },
}));

vi.mock('expo-device', () => ({
    default: { isDevice: true },
}));

vi.mock('expo-notifications', () => ({
    default: {},
}));

vi.mock('../../../firebase/firebaseAuth', () => ({
    auth: mocks.auth,
}));

vi.mock('../services/postAuthSetupService', () => ({
    registerPostAuthDevice: mocks.registerPostAuthDevice,
    cleanupPostAuthDevice: mocks.cleanupPostAuthDevice,
}));

vi.mock('../services/authProviderLinkingService', () => ({
    signOutGoogleProvider: mocks.signOutGoogleProvider,
    signInWithGoogleProvider: vi.fn(async () => { }),
    linkGoogleProvider: vi.fn(),
    linkPasswordProvider: vi.fn(),
    unlinkAuthProvider: vi.fn(),
}));

vi.mock('../services/firebaseCredentialService', () => ({
    signInWithEmail: vi.fn(async () => { }),
    signUpWithEmail: vi.fn(async () => { }),
}));

vi.mock('../../../hooks/useRegisterForPushNotifications', () => ({
    useRegisterForPushNotifications: () => ({
        registerForPushNotificationsAsync: mocks.registerForPushNotificationsAsync,
    }),
}));

vi.mock('../../../hooks/useOnAppForeground', () => ({
    useOnAppForeground: () => undefined,
}));

vi.mock('../../../services/api/apiClient', () => ({
    createApiClient: vi.fn(() => ({
        request: vi.fn(),
        requestText: vi.fn(async () => ''),
        withSourcePushToken: vi.fn(),
        waitForTaskResultById: vi.fn(),
        getDeviceId: vi.fn(async () => 'device-1'),
    })),
}));

import { AuthProvider, useAuth } from './AuthContext';

const authApi: { current: ReturnType<typeof useAuth> | null } = { current: null };

const Probe = () => {
    authApi.current = useAuth();
    return null;
};

const renderAuth = () => render(
    <AuthProvider>
        <Probe />
    </AuthProvider>,
);

async function flush() {
    await act(async () => {
        await Promise.resolve();
    });
}

describe('useAuthSession (authSession semantics)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tokenListeners.clear();
        mocks.auth.currentUser = mocks.firebaseUser;
    });

    it('runs post-auth device registration on a token change for a signed-in user', async () => {
        renderAuth();
        await flush();

        await act(async () => {
            mocks.emitTokenChange(mocks.firebaseUser);
        });
        await flush();

        expect(mocks.registerPostAuthDevice).toHaveBeenCalledTimes(1);
    });

    it('stays muted for the WHOLE reauth flow (multiple token changes)', async () => {
        renderAuth();
        await flush();

        act(() => {
            authApi.current!.setLoginWithReauthenticateWithCredential(true);
        });

        await act(async () => {
            mocks.emitTokenChange(mocks.firebaseUser);
        });
        await flush();
        await act(async () => {
            mocks.emitTokenChange(mocks.firebaseUser);
        });
        await flush();

        expect(mocks.registerPostAuthDevice).not.toHaveBeenCalled();

        act(() => {
            authApi.current!.setLoginWithReauthenticateWithCredential(false);
        });
        await act(async () => {
            mocks.emitTokenChange(mocks.firebaseUser);
        });
        await flush();

        expect(mocks.registerPostAuthDevice).toHaveBeenCalledTimes(1);
    });

    it('resets the reauth gate when the session ends (sign-out)', async () => {
        renderAuth();
        await flush();

        act(() => {
            authApi.current!.setLoginWithReauthenticateWithCredential(true);
        });

        await act(async () => {
            mocks.emitTokenChange(null);
        });
        await flush();

        // Gate was reset by the null-user transition; the next sign-in runs
        // post-auth setup without waiting for a flow finally.
        await act(async () => {
            mocks.emitTokenChange(mocks.firebaseUser);
        });
        await flush();

        expect(mocks.registerPostAuthDevice).toHaveBeenCalledTimes(1);
    });

    it('a concurrent second signOut awaits the in-flight one instead of skipping cleanup ordering', async () => {
        let releaseCleanup: (() => void) | null = null;
        mocks.cleanupPostAuthDevice.mockImplementationOnce(() => new Promise<void>(resolve => {
            releaseCleanup = resolve;
        }));

        renderAuth();
        await flush();

        let firstDone = false;
        let secondDone = false;
        const first = act(async () => {
            await authApi.current!.signOut();
            firstDone = true;
        });
        const second = act(async () => {
            await authApi.current!.signOut();
            secondDone = true;
        });

        await flush();
        // Neither call finished while cleanup is pending; cleanup ran once.
        expect(mocks.cleanupPostAuthDevice).toHaveBeenCalledTimes(1);

        releaseCleanup!();
        await first;
        await second;

        expect(firstDone).toBe(true);
        expect(secondDone).toBe(true);
        expect(mocks.cleanupPostAuthDevice).toHaveBeenCalledTimes(1);
        expect(mocks.firebaseSignOut).toHaveBeenCalledTimes(1);
    });
});

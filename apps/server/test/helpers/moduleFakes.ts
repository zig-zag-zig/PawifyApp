import { createRequire } from 'node:module';

const requireForTest = createRequire(__filename);

export const installModuleFake = (
    modulePathFromHelper: string,
    exports: Record<string, unknown>,
): void => {
    const modulePath = requireForTest.resolve(modulePathFromHelper);

    requireForTest.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    } as NodeModule;
};

const unexpectedFirebaseCall = (name: string) => async (): Promise<never> => {
    throw new Error(`Unexpected Firebase store ${name} call in unit test`);
};

/** Installs Firebase store fakes that throw on any call. Used by unit tests. */
export const installFirebaseServiceFake = (): void => {
    installModuleFake('../../src/services/firebase/followingStore.js', {
        getFollowingFromDb: unexpectedFirebaseCall('getFollowingFromDb'),
    });
    installModuleFake('../../src/services/firebase/knownReleasesStore.js', {
        getKnownArtistReleaseIdsFromDb: unexpectedFirebaseCall('getKnownArtistReleaseIdsFromDb'),
        getKnownReleasesFromDb: unexpectedFirebaseCall('getKnownReleasesFromDb'),
    });
    installModuleFake('../../src/services/firebase/newReleasesStore.js', {
        getNewReleasesSnapshotFromDb: unexpectedFirebaseCall('getNewReleasesSnapshotFromDb'),
        removeNewReleasesFromDb: unexpectedFirebaseCall('removeNewReleasesFromDb'),
    });
};

const makeMockAuth = () => ({
    revokeRefreshTokens: async () => {},
    updateUser: async (_uid: string, _props: unknown) => ({}),
    deleteUser: async () => {},
    getUser: async (uid: string) =>
        ({
            uid,
            email: 'test@example.com',
            emailVerified: true,
            displayName: 'Test User',
        }) satisfies { uid: string; email: string; emailVerified: boolean; displayName: string },
    getUserByEmail: async (email: string) => ({
        uid: 'test-user-id',
        email,
        emailVerified: true,
        displayName: 'Test User',
    }),
    verifyIdToken: async (token: string) => {
        if (token === 'valid-token') {
            return { uid: 'test-user-id' };
        }
        throw new Error('Invalid token');
    },
    listUsers: async () => ({ users: [], pageToken: undefined }),
    setCustomUserClaims: async () => {},
    createCustomToken: async (_uid: string, _claims?: unknown) => 'custom-token',
});

const makeMockFirestore = () => {
    const batchFn = () => ({
        set: () => {},
        update: () => {},
        delete: () => {},
        commit: async () => {},
    });
    return {
        collection: () => ({
            doc: () => ({
                get: async () => ({ exists: false, data: () => null }),
                set: async () => {},
                update: async () => {},
                delete: async () => {},
            }),
        }),
        batch: batchFn,
        recursiveDelete: async () => {},
    };
};

const makeMockRtdb = () => ({
    ref: () => ({
        once: async () => ({ val: () => null }),
        set: async () => {},
        remove: async () => {},
        update: async () => {},
    }),
});

/** Installs a full working Firebase mock. Used by HTTP integration tests. */
export const installFirebaseFakes = (): void => {
    installModuleFake('../../src/infrastructure/firebase/firebaseInit.js', {
        db: makeMockFirestore(),
        auth: makeMockAuth(),
        rtdb: makeMockRtdb(),
    });
};

/** Installs Firebase store fakes with working (no-op) implementations. */
export const installFirebaseStoreFakes = (): void => {
    installModuleFake('../../src/services/firebase/followingStore.js', {
        getFollowingFromDb: async () => [],
        readFollowingArtistsMap: async () => ({}),
        writeFollowingArtistsMap: async () => {},
    });
    installModuleFake('../../src/services/firebase/knownReleasesStore.js', {
        getKnownArtistReleaseIdsFromDb: async () => [],
        getKnownReleasesFromDb: async () => ({}),
        deleteKnownArtistReleasesFromDb: async () => {},
    });
    installModuleFake('../../src/services/firebase/newReleasesStore.js', {
        getNewReleasesSnapshotFromDb: async () => ({ newReleasesMap: {}, coverPageEntries: [] }),
        removeNewReleasesFromDb: async () => {},
        readNewReleasesState: async () => ({}),
        writeNewReleasesState: async () => {},
    });
    installModuleFake('../../src/services/firebase/pushTokenStore.js', {
        deleteDevicePushTokenFromDb: async () => {},
        deleteUserPushTokensFromDb: async () => {},
        savePushTokenToDb: async () => {},
        deletePushTokenFromDb: async () => {},
    });
    installModuleFake('../../src/services/firebase/notificationRunLockStore.js', {
        acquireNotifyNewReleasesLock: async () => true,
        releaseNotifyNewReleasesLock: async () => {},
    });
    installModuleFake('../../src/services/firebase/refs.js', {
        getUserRef: () => ({
            get: async () => ({ exists: false, data: () => null }),
            set: async () => {},
            update: async () => {},
        }),
    });
};

/** Installs working Dapr infrastructure fakes. */
export const installDaprFakes = (): void => {
    installModuleFake('../../src/infrastructure/dapr/daprStateStore.js', {
        getStateValue: async () => null,
        saveStateValues: async () => {},
        deleteStateValues: async () => {},
    });
    installModuleFake('../../src/infrastructure/dapr/daprClient.js', {
        daprClient: {},
    });
    installModuleFake('../../src/infrastructure/dapr/daprSecrets.js', {
        getSecret: async () => '',
    });
    installModuleFake('../../src/infrastructure/dapr/daprBindings.js', {
        sendBinding: async () => {},
    });
    installModuleFake('../../src/infrastructure/dapr/daprLockStore.js', {
        acquireLock: async () => true,
        releaseLock: async () => {},
    });
    installModuleFake('../../src/infrastructure/dapr/daprHttp.js', {
        daprHttpFetch: async () => new Response(''),
    });
};

/** Installs a no-op Sentry fake. */
export const installSentryFakes = (): void => {
    installModuleFake('../../src/infrastructure/monitoring/sentry.js', {
        setupExpressErrorMonitoring: () => {},
        captureException: () => {},
    });
};

/** Installs working user/auth service fakes. */
export const installAccountServiceFakes = (
    checkAuth: (req: { headers: { authorization?: string } }) => Promise<string>,
) => {
    installModuleFake('../../src/services/firebase/userStore.js', {
        checkAuth: async (req: { headers: { authorization?: string } }) => checkAuth(req),
        deleteUserAccount: async () => {},
        getDocumentRefAndSnapshot: async () => ({
            snapShot: {},
            ref: { get: async () => ({ exists: false, data: () => null }), set: async () => {} },
        }),
    });
    installModuleFake('../../src/services/account/accountIdentityService.js', {
        changeEmail: async () => {},
        revokeToken: async () => {},
    });
    installModuleFake('../../src/services/account/passwordResetOtpService.js', {
        sendOtp: async () => {},
        verifyOtp: async () => ({ email: 'test@example.com' }),
    });
};

export const installFirebaseTypesFake = (): void => {
    installModuleFake('../../src/services/firebase/types.js', {
        RequestWithAuthHeader: {},
        UNAUTH_MESSAGE: 'Unauthorized',
    });
};

export const installPushTokenAdapterFake = (): void => {
    installModuleFake('../../src/services/notifications/pushTokenStoreAdapter.js', {
        savePushToken: async () => {},
        deletePushToken: async () => {},
    });
};

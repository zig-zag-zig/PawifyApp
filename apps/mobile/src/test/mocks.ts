import { vi } from 'vitest';

// ------- diagnostics -------

export function mockDiagnostics() {
    return {
        describeError: vi.fn(() => ({})),
        describeIds: vi.fn(() => ({})),
        describeValueShape: vi.fn(() => ({})),
        describeNullableStringMap: vi.fn(() => ({})),
        diagnosticLog: vi.fn(),
        diagnosticWarn: vi.fn(),
        diagnosticError: vi.fn(),
        elapsedSince: vi.fn(() => 1),
        shortenString: vi.fn((s: string) => s),
        shouldLogArtistTaskDiagnostics: vi.fn(() => false),
        shouldLogApiDiagnostics: vi.fn(() => false),
        normalizeDiagnosticValue: vi.fn((v: unknown) => v),
    };
}

// ------- expo-file-system -------

export function mockExpoFileSystem(overrides: {
    fileExists?: boolean;
    fileSize?: number;
    fileDelete?: ReturnType<typeof vi.fn>;
    downloadResult?: { exists: boolean; size: number };
} = {}) {
    const {
        fileExists = false,
        fileSize = 0,
        fileDelete = vi.fn(),
        downloadResult = { exists: true, size: 1024 },
    } = overrides;

    class MockFile {
        uri: string;
        exists: boolean;
        size: number;
        delete: ReturnType<typeof vi.fn>;

        constructor(...parts: Array<string | { uri: string }>) {
            this.uri = parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/');
            this.exists = fileExists;
            this.size = fileSize;
            this.delete = fileDelete;
        }

        static downloadFileAsync = vi.fn().mockResolvedValue({
            uri: `file:///tmp/downloaded`,
            exists: downloadResult.exists,
            size: downloadResult.size,
        });
    }

    class MockDirectory {
        uri: string;
        exists = false;
        delete = vi.fn();
        create = vi.fn();

        constructor(...parts: Array<string | { uri: string }>) {
            this.uri = parts.map(part => (typeof part === 'string' ? part : part.uri)).join('/');
        }

        list = vi.fn(() => []);
    }

    return {
        File: MockFile,
        Directory: MockDirectory,
        Paths: {
            cache: new MockDirectory('file:///tmp'),
        },
    };
}

// ------- react-native -------

export function mockReactNative(platform: 'android' | 'ios' = 'android') {
    return {
        Platform: { OS: platform, select: vi.fn((obj: Record<string, unknown>) => obj[platform]) },
        NativeModules: {},
        AppState: {
            currentState: 'active',
            addEventListener: vi.fn(() => ({ remove: vi.fn() })),
        },
        Linking: {
            openURL: vi.fn(async () => { }),
        },
        StyleSheet: {
            create: (styles: Record<string, unknown>) => styles,
            flatten: (style: unknown) => style,
        },
    };
}

// ------- AsyncStorage -------

export function mockAsyncStorage(initial: Record<string, string> = {}) {
    let storage = { ...initial };

    return {
        default: {
            getItem: vi.fn(async (key: string) => storage[key] ?? null),
            setItem: vi.fn(async (key: string, value: string) => {
                storage[key] = value;
            }),
            removeItem: vi.fn(async (key: string) => {
                delete storage[key];
            }),
        },
        // Expose for test inspection
        _getStore: () => storage,
        _resetStore: (newStore: Record<string, string> = {}) => {
            storage = { ...newStore };
        },
    };
}

// ------- react-native-safe-area-context -------

export function mockSafeAreaContext() {
    const React = require('react');

    return {
        SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        SafeAreaView: ({ children, style, edges }: {
            children: React.ReactNode;
            style?: unknown;
            edges?: unknown;
        }) => React.createElement('SafeAreaView', { style, edges }, children),
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    };
}

// ------- firebase auth -------

export function mockFirebaseAuth(overrides: { currentUser?: unknown } = {}) {
    const { currentUser = null } = overrides;
    return {
        auth: {
            currentUser,
            onIdTokenChanged: vi.fn(() => vi.fn()),
            signOut: vi.fn(async () => { }),
        },
        signOut: vi.fn(async () => { }),
        onIdTokenChanged: vi.fn(() => vi.fn()),
    };
}

// ------- ENV config -------

export function mockEnv(overrides: Record<string, unknown> = {}) {
    return {
        ENV: {
            apiBaseUrl: 'https://api.example.test/',
            apiVersion: 'v1',
            appBuildVersion: null,
            appEnv: 'development',
            appVersion: '1.0.0',
            googleWebClientId: 'test-client-id',
            artistDiagnosticsEnabled: false,
            firebaseAuthEmulatorUrl: null,
            firebaseProjectId: null,
            sentryDsn: null,
            sentryEnabled: false,
            sentryTracesSampleRate: 0,
            taskResultNotificationWaitMs: 30000,
            taskResultPollIntervalMs: 10000,
            taskResultTimeoutMs: 120000,
            imageCacheTimeoutMaxRetries: 3,
            imageCacheTimeoutRetryBaseDelayMs: 300,
            imageRemoteReloadRetryDelayMs: 250,
            updateGithubRepoUrl: null,
            updateGithubToken: null,
            ...overrides,
        },
    };
}

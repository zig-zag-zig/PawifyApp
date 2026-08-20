import { vi } from 'vitest';

// Shared test setup loaded once per test file via vitest.config.ts setupFiles.
// This file runs before any test code, so mocks here apply globally.

const globalWithDev = globalThis as typeof globalThis & { __DEV__?: boolean };
if (typeof globalWithDev.__DEV__ === 'undefined') {
    globalWithDev.__DEV__ = false;
}

// Provide required env before modules that evaluate src/config/env at import
// time (EventService -> diagnostics -> env) run during test collection.
if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.test/';
}

// expo-constants loads native expo-modules-core at import time, which fails
// under jsdom. Tests that need the real value mock expo-constants locally.
vi.mock('expo-constants', () => ({
    default: {
        expoConfig: {
            version: '1.0.0',
            extra: { appEnv: 'test' },
        },
        nativeAppVersion: '1.0.0',
        nativeBuildVersion: '1',
    },
}));

// Silence known noisy warnings during tests.
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
    const message = args.map(String).join(' ');
    // Suppress expected warnings from mocked native modules.
    if (
        message.includes('NativeModule:') ||
        message.includes('expo-file-system') ||
        message.includes('firebase')
    ) {
        return;
    }
    originalWarn(...args);
};

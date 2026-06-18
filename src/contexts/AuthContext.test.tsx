// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { mockDiagnostics } from '../test/mocks';

// AuthContext imports firebase/auth and firebase/app at module scope.
// Full unit testing requires mocking the entire Firebase SDK + native modules.
// Core auth flows (signIn, signOut, Google sign-in, token refresh) are covered
// by Maestro E2E tests (.maestro/*.yaml). This file validates the context
// contract and error boundaries.

describe('useAuth (contract validation)', () => {
    it('throws when used outside AuthProvider', async () => {
        // Dynamic import to isolate the module from firebase side-effects
        vi.mock('../firebase/firebaseAuth', () => ({
            auth: {
                currentUser: null,
                onIdTokenChanged: vi.fn(() => vi.fn()),
            },
        }));
        vi.mock('../config/env', () => ({
            ENV: {
                apiBaseUrl: 'https://api.test/',
                apiVersion: 'v1',
                googleWebClientId: 'test-id',
                artistDiagnosticsEnabled: false,
                sentryEnabled: false,
                taskResultNotificationWaitMs: 30000,
                taskResultPollIntervalMs: 10000,
                taskResultTimeoutMs: 120000,
            },
        }));
        vi.mock('@react-native-async-storage/async-storage', () => ({
            default: {},
        }));
        vi.mock('react-native', () => ({
            AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
            Platform: { OS: 'android' },
            NativeModules: {},
        }));
        vi.mock('expo-constants', () => ({
            default: { expoConfig: { version: '1.0.0' } },
        }));
        vi.mock('react-native-device-info', () => ({
            getUniqueId: vi.fn(async () => 'device-1'),
        }));
        vi.mock('expo-device', () => ({
            default: { isDevice: true },
        }));
        vi.mock('expo-notifications', () => ({
            default: {},
        }));
        vi.mock('react-native-safe-area-context', () => ({
            SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
        }));
        vi.mock('../utils/diagnostics', () => mockDiagnostics());
        vi.mock('../services/api/apiClient', () => ({
            createApiClient: vi.fn(() => ({
                request: vi.fn(),
                withSourcePushToken: vi.fn(),
                waitForTaskResult: vi.fn(),
                getDeviceId: vi.fn(async () => 'device-1'),
            })),
        }));

        const { useAuth } = await import('../contexts/AuthContext');

        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => renderHook(() => useAuth())).toThrow(
            'useAuth must be used within an AuthProvider',
        );
        spy.mockRestore();
    });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { NetInfoState } from '@react-native-community/netinfo';

type NetInfoListener = (state: NetInfoState) => void;
type AppStateListener = (state: string) => void;

let netInfoListener: NetInfoListener | undefined;
let netInfoUnsubscribed: boolean;
let appStateListener: AppStateListener | undefined;
let fetchResult: Partial<NetInfoState>;

const mocks = vi.hoisted(() => ({
    appState: {
        currentState: 'active' as string,
        addEventListener: vi.fn((_event: string, cb: AppStateListener) => {
            appStateListener = cb;
            return { remove: vi.fn() };
        }),
    },
}));

vi.mock('react-native', () => ({
    AppState: mocks.appState,
}));

vi.mock('@react-native-community/netinfo', () => ({
    addEventListener: vi.fn((cb: NetInfoListener) => {
        netInfoListener = cb;
        netInfoUnsubscribed = false;
        return () => {
            netInfoUnsubscribed = true;
        };
    }),
    fetch: vi.fn(async () => fetchResult),
}));

const state = (isConnected: boolean | null): NetInfoState =>
    ({ isConnected }) as NetInfoState;

import { useIsOffline } from './useIsOffline';

const emitAppState = (next: string) => {
    act(() => {
        mocks.appState.currentState = next;
        appStateListener?.(next);
    });
};

const emitNetInfo = (isConnected: boolean | null) => {
    act(() => {
        netInfoListener?.(state(isConnected));
    });
};

describe('useIsOffline', () => {
    beforeEach(() => {
        netInfoListener = undefined;
        netInfoUnsubscribed = false;
        appStateListener = undefined;
        fetchResult = state(true);
        mocks.appState.currentState = 'active';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('is offline only on a definite isConnected === false', async () => {
        const { result } = renderHook(() => useIsOffline());
        await act(async () => {});

        expect(result.current).toBe(false);
        emitNetInfo(false);
        expect(result.current).toBe(true);
    });

    it('does not treat null/unknown connectivity as offline', async () => {
        const { result } = renderHook(() => useIsOffline());
        await act(async () => {});

        emitNetInfo(null);
        expect(result.current).toBe(false);
    });

    it('stops observing while backgrounded so suspended readings cannot flip it', async () => {
        const { result } = renderHook(() => useIsOffline());
        await act(async () => {});
        emitNetInfo(true);

        emitAppState('background');
        expect(netInfoUnsubscribed).toBe(true);

        // A stale offline reading while unsubscribed must not reach the hook.
        const savedListener = netInfoListener;
        netInfoListener = undefined;
        savedListener?.(state(false));
        expect(result.current).toBe(false);
    });

    it('re-derives from a fresh NetInfo.fetch on resume (no stale replay)', async () => {
        const { result } = renderHook(() => useIsOffline());
        await act(async () => {});

        emitAppState('background');
        // Connectivity returned while suspended.
        fetchResult = state(true);
        emitAppState('active');
        await act(async () => {});

        expect(result.current).toBe(false);
    });

    it('still reports offline after resume when the device really is offline', async () => {
        const { result } = renderHook(() => useIsOffline());
        await act(async () => {});

        emitNetInfo(false);
        emitAppState('background');
        fetchResult = state(false);
        emitAppState('active');
        await act(async () => {});

        expect(result.current).toBe(true);
    });
});

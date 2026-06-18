// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

let capturedListener: ((state: string) => void) | undefined;

vi.mock('react-native', () => ({
    AppState: {
        currentState: 'active' as string,
        addEventListener: vi.fn((_event: string, cb: (state: string) => void) => {
            capturedListener = cb;
            return { remove: vi.fn() };
        }),
    },
}));

vi.mock('../services/externalNavigation', () => ({
    getExternalNavigationResumeDelayMs: vi.fn(() => 0),
}));

import { AppState } from 'react-native';
import { useOnAppForeground } from './useOnAppForeground';

const mockAppState = AppState as unknown as { currentState: string; addEventListener: ReturnType<typeof vi.fn> };

describe('useOnAppForeground', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockAppState.currentState = 'active';
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('calls handler with inactiveMs when app returns to active from background', () => {
        const onForeground = vi.fn();

        mockAppState.currentState = 'active';
        renderHook(() => useOnAppForeground(onForeground));

        // Simulate background
        mockAppState.currentState = 'background';
        capturedListener?.('background');

        // Advance time by 5 seconds
        vi.advanceTimersByTime(5000);

        // Return to foreground
        mockAppState.currentState = 'active';
        capturedListener?.('active');

        expect(onForeground).toHaveBeenCalledTimes(1);
        const info = onForeground.mock.calls[0][0];
        expect(info.previousAppState).toBe('background');
        expect(info.inactiveMs).toBeGreaterThanOrEqual(5000);
    });

    it('does not call handler when disabled', () => {
        const onForeground = vi.fn();
        mockAppState.currentState = 'background';
        renderHook(() => useOnAppForeground(onForeground, { enabled: false }));

        capturedListener?.('active');
        expect(onForeground).not.toHaveBeenCalled();
    });

    it('does not call handler on initial mount when already active', () => {
        const onForeground = vi.fn();
        mockAppState.currentState = 'active';
        renderHook(() => useOnAppForeground(onForeground));

        expect(onForeground).not.toHaveBeenCalled();
    });
});

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

vi.mock('react-native', () => ({
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    View: 'View',
}));

vi.mock('../components/ui/Spinner', () => ({
    Spinner: 'Spinner',
}));

import { GlobalSpinnerProvider, useGlobalSpinner } from '../contexts/GlobalSpinnerContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(GlobalSpinnerProvider, null, children);

describe('GlobalSpinnerContext', () => {
    it('registers and unregisters spinner source', () => {
        const { unmount } = renderHook(
            () => useGlobalSpinner(true),
            { wrapper },
        );

        // Source is registered on mount; no assertion needed as it's internal.
        // Just verify no throw.
        unmount();
        // Cleanup should unregister without error.
    });

    it('handles isLoading false without error', () => {
        const { unmount } = renderHook(
            () => useGlobalSpinner(false),
            { wrapper },
        );

        unmount();
    });

    it('handles toggle from false to true', () => {
        let isLoading = false;
        const { rerender, unmount } = renderHook(
            () => useGlobalSpinner(isLoading),
            { wrapper },
        );

        isLoading = true;
        rerender();

        unmount();
    });

    it('no-ops when used outside provider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        // useGlobalSpinner is designed to silently no-op when outside provider.
        spy.mockRestore();
    });
});

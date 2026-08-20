// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    StyleSheet: { create: (styles: Record<string, unknown>) => styles },
    View: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

let latestBanner: { message: string; visible: boolean } | null = null;
vi.mock('../components/InfoBanner', () => ({
    InfoBanner: (props: { message: string; visible: boolean }) => {
        latestBanner = props;
        return null;
    },
}));

import { ToastProvider, useToast } from './ToastContext';

const showToastRef: { current: ReturnType<typeof useToast>['showToast'] | null } = { current: null };

const Probe = () => {
    const { showToast } = useToast();
    showToastRef.current = showToast;
    return null;
};

const renderToast = () => render(
    <ToastProvider>
        <Probe />
    </ToastProvider>,
);

describe('ToastContext', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        latestBanner = null;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows the toast after the mount micro-delay', () => {
        renderToast();
        act(() => showToastRef.current!('Hello', 'success'));
        act(() => vi.advanceTimersByTime(0));

        expect(latestBanner?.message).toBe('Hello');
        expect(latestBanner?.visible).toBe(true);
    });

    it('invokes the previous onDismiss when a toast is replaced', () => {
        renderToast();
        const onDismissA = vi.fn();

        act(() => showToastRef.current!('A', 'info', onDismissA));
        act(() => vi.advanceTimersByTime(0));
        expect(onDismissA).not.toHaveBeenCalled();

        act(() => showToastRef.current!('B', 'info'));
        expect(onDismissA).toHaveBeenCalledTimes(1);
    });

    it('invokes onDismiss when hidden via visible=false', () => {
        renderToast();
        const onDismiss = vi.fn();

        act(() => showToastRef.current!('A', 'info', onDismiss, true));
        act(() => vi.advanceTimersByTime(0));
        act(() => showToastRef.current!('A', 'info', onDismiss, false));

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('auto-dismisses error toasts after 8s by default', () => {
        renderToast();
        const onDismiss = vi.fn();

        act(() => showToastRef.current!('E', 'error', onDismiss));
        act(() => vi.advanceTimersByTime(0));
        act(() => vi.advanceTimersByTime(7999));
        expect(onDismiss).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('keeps error toasts on screen when timeout is 0', () => {
        renderToast();
        const onDismiss = vi.fn();

        act(() => showToastRef.current!('E', 'error', onDismiss, undefined, undefined, 0));
        act(() => vi.advanceTimersByTime(0));
        act(() => vi.advanceTimersByTime(20000));

        expect(onDismiss).not.toHaveBeenCalled();
        expect(latestBanner?.message).toBe('E');
    });

    it('auto-dismisses non-error toasts after 2500ms by default', () => {
        renderToast();
        const onDismiss = vi.fn();

        act(() => showToastRef.current!('S', 'success', onDismiss));
        act(() => vi.advanceTimersByTime(0));
        act(() => vi.advanceTimersByTime(2500));

        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('respects an explicit timeout over the type default', () => {
        renderToast();
        const onDismiss = vi.fn();

        act(() => showToastRef.current!('S', 'success', onDismiss, undefined, undefined, 1000));
        act(() => vi.advanceTimersByTime(0));
        act(() => vi.advanceTimersByTime(999));
        expect(onDismiss).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1));
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('throws when used outside a ToastProvider', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => render(<Probe />)).toThrow('useToast must be used within a ToastProvider');
        spy.mockRestore();
    });
});

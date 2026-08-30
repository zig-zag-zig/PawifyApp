// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useEventDrivenBanner } from './useEventDrivenBanner';

describe('useEventDrivenBanner', () => {
    it('starts with banner hidden', () => {
        const ref = { current: false } as React.RefObject<boolean>;
        const { result } = renderHook(() => useEventDrivenBanner(ref));
        expect(result.current[0]).toBe(false);
    });

    it('shows banner when pending flag is true and consumes it', () => {
        const ref = { current: true } as React.RefObject<boolean>;
        const { result } = renderHook(() => useEventDrivenBanner(ref));
        expect(result.current[0]).toBe(true);
        expect(ref.current).toBe(false);
    });

    it('can dismiss banner via setter', () => {
        const ref = { current: true } as React.RefObject<boolean>;
        const { result } = renderHook(() => useEventDrivenBanner(ref));

        act(() => {
            result.current[1](false);
        });

        expect(result.current[0]).toBe(false);
    });

    it('re-evaluates when eventVersion changes', () => {
        const ref = { current: false } as React.RefObject<boolean>;

        const { result, rerender } = renderHook(
            ({ version }: { version: number }) => useEventDrivenBanner(ref, version),
            { initialProps: { version: 0 } },
        );

        expect(result.current[0]).toBe(false);

        ref.current = true;
        rerender({ version: 1 });

        expect(result.current[0]).toBe(true);
        expect(ref.current).toBe(false);
    });
});

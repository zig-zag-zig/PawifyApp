// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('react-native', () => {
    class AnimatedValue {
        setValue() {}
    }

    return {
        Animated: {
            Value: AnimatedValue,
            timing: () => ({ start: () => {} }),
            View: 'Animated.View',
        },
        Pressable: 'Pressable',
        StyleSheet: { create: (s: Record<string, unknown>) => s },
        View: 'View',
    };
});

vi.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));

import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useScrollAffordance } from './ScrollAffordance';

type Geometry = {
    offsetY?: number;
    contentHeight?: number;
    viewportHeight?: number;
};

/** The scroll event carries the whole geometry, exactly as the platform does. */
const scrollEvent = ({
    offsetY = 0,
    contentHeight = 0,
    viewportHeight = 0,
}: Geometry): NativeSyntheticEvent<NativeScrollEvent> =>
    ({
        nativeEvent: {
            contentOffset: { x: 0, y: offsetY },
            contentSize: { width: 400, height: contentHeight },
            layoutMeasurement: { width: 400, height: viewportHeight },
        },
    }) as unknown as NativeSyntheticEvent<NativeScrollEvent>;

const layoutEvent = (viewportHeight: number): LayoutChangeEvent =>
    ({
        nativeEvent: { layout: { x: 0, y: 0, width: 400, height: viewportHeight } },
    }) as unknown as LayoutChangeEvent;

const SCREEN = 800;

describe('useScrollAffordance', () => {
    it('shows nothing before the viewport has laid out', () => {
        const { result } = renderHook(() => useScrollAffordance());

        act(() => result.current.onContentSizeChange(400, 5000));

        expect(result.current.showScrollToTop).toBe(false);
        expect(result.current.showScrollToBottom).toBe(false);
    });

    it('offers the bottom button as soon as a tall list lays out, with no scroll yet', () => {
        const { result } = renderHook(() => useScrollAffordance());

        // The reported bug: after "Load more" grew the content, the bottom button only
        // appeared after a tiny nudge produced the next scroll event.
        act(() => result.current.onViewportLayout(layoutEvent(SCREEN)));
        act(() => result.current.onContentSizeChange(400, 4000));

        expect(result.current.showScrollToTop).toBe(false);
        expect(result.current.showScrollToBottom).toBe(true);
    });

    it('counts rows appended while the user sits at the top', () => {
        const { result } = renderHook(() => useScrollAffordance());

        act(() => result.current.onScroll(scrollEvent({ offsetY: 0, contentHeight: 900, viewportHeight: SCREEN })));
        expect(result.current.showScrollToBottom).toBe(false);

        act(() => result.current.onContentSizeChange(400, 3000));
        expect(result.current.showScrollToBottom).toBe(true);
    });

    it('keeps the bottom button hidden for a list only slightly taller than the screen', () => {
        const { result } = renderHook(() => useScrollAffordance());

        act(() => result.current.onScroll(scrollEvent({ offsetY: 0, contentHeight: SCREEN + 200, viewportHeight: SCREEN })));

        expect(result.current.showScrollToBottom).toBe(false);
    });

    it('drops the bottom button at the end of the list and keeps the top one', () => {
        const { result } = renderHook(() => useScrollAffordance());

        act(() => result.current.onScroll(scrollEvent({ offsetY: 400, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(result.current.showScrollToTop).toBe(true);
        expect(result.current.showScrollToBottom).toBe(true);

        act(() => result.current.onScroll(scrollEvent({ offsetY: 3200, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(result.current.showScrollToTop).toBe(true);
        expect(result.current.showScrollToBottom).toBe(false);
    });

    it('clamps a stale offset when the list shrinks, so the top button does not stick', () => {
        const { result } = renderHook(() => useScrollAffordance());

        act(() => result.current.onScroll(scrollEvent({ offsetY: 2000, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(result.current.showScrollToTop).toBe(true);

        // A new search replaces the data; the platform reports the smaller content
        // before the resulting scroll, so the offset has to be capped here.
        act(() => result.current.onContentSizeChange(400, 1000));

        expect(result.current.showScrollToTop).toBe(false);
        expect(result.current.showScrollToBottom).toBe(false);
    });

    it('recovers the top button when a transient content dip is corrected, without a scroll', () => {
        const { result } = renderHook(() => useScrollAffordance());

        act(() => result.current.onScroll(scrollEvent({ offsetY: 2000, contentHeight: 4000, viewportHeight: SCREEN })));

        // Cell pruning can briefly report a shorter content height. The clamp is local
        // to the decision, so the stored offset survives the dip.
        act(() => result.current.onContentSizeChange(400, 1000));
        expect(result.current.showScrollToTop).toBe(false);

        act(() => result.current.onContentSizeChange(400, 4000));
        expect(result.current.showScrollToTop).toBe(true);
        expect(result.current.showScrollToBottom).toBe(true);
    });

    it('holds the decision when the viewport re-lays out unchanged', () => {
        const { result } = renderHook(() => useScrollAffordance());

        act(() => result.current.onScroll(scrollEvent({ offsetY: 0, contentHeight: 4000, viewportHeight: SCREEN })));
        expect(result.current.showScrollToBottom).toBe(true);

        // Rotation, banner show/hide and keyboard events re-layout the viewport; a
        // repeat of the same height must not disturb the content geometry.
        act(() => result.current.onViewportLayout(layoutEvent(SCREEN)));

        expect(result.current.showScrollToBottom).toBe(true);
    });
});

describe('useScrollAffordance handler identity', () => {
    it('keeps the event handlers stable across a decision flip', () => {
        const { result } = renderHook(() => useScrollAffordance());
        const first = {
            onScroll: result.current.onScroll,
            onContentSizeChange: result.current.onContentSizeChange,
            onViewportLayout: result.current.onViewportLayout,
        };

        // Lists are memoised on their props; a new handler per render would defeat that
        // on every scroll tick, so the handlers must survive a state change.
        act(() => result.current.onScroll(scrollEvent({ offsetY: 400, contentHeight: 4000, viewportHeight: SCREEN })));

        expect(result.current.showScrollToTop).toBe(true);
        expect(result.current.onScroll).toBe(first.onScroll);
        expect(result.current.onContentSizeChange).toBe(first.onContentSizeChange);
        expect(result.current.onViewportLayout).toBe(first.onViewportLayout);
    });
});

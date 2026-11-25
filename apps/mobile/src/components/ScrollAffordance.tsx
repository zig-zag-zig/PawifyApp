import React, { useCallback, useRef, useState } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    View,
    type LayoutChangeEvent,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from '../styles/theme';

/**
 * Floating scroll affordances for long lists.
 *
 * Two deliberate constraints, one per button:
 *
 * - "Top" needs a real run above the viewport (SHOW_AFTER_PX), so short lists never
 *   grow a button that does nothing.
 * - "Bottom" needs a meaningful run left below the viewport (MIN_BOTTOM_DISTANCE_PX).
 *   Otherwise a list that is only a few rows taller than the screen would show two
 *   buttons offering the same tiny jump.
 *
 * Each button is decided by the run in *its own* direction only: a freshly loaded long
 * list shows "bottom" right away, and a list scrolled to its end shows only "top".
 *
 * The geometry behind those two numbers comes from three sources, because "Load more"
 * changes the content without the user moving: scroll events carry offset *and*
 * content/viewport size, `onContentSizeChange` carries a new content height, and
 * `onLayout` carries a new viewport height. Wiring only the scroll event made the
 * bottom button lag one nudge behind every content growth -- the appended rows were
 * counted only once some finger movement produced a fresh scroll event.
 *
 * The buttons sit in a bottom-right column with a margin from the safe area/edge, and
 * they are small circles, so they cover as little list content as possible and never
 * sit on top of a row's tap target in the middle of the screen.
 */
const SHOW_AFTER_PX = 320;
const MIN_BOTTOM_DISTANCE_PX = 600;

export type ScrollMetrics = {
    offsetY: number;
    contentHeight: number;
    viewportHeight: number;
};

type ScrollFlags = {
    showScrollToTop: boolean;
    showScrollToBottom: boolean;
};

const decide = ({ offsetY, contentHeight, viewportHeight }: ScrollMetrics): ScrollFlags => {
    // Nothing is measurable until the viewport itself has laid out; a content height
    // arriving first would otherwise look like an infinitely long list.
    if (viewportHeight <= 0) {
        return { showScrollToTop: false, showScrollToBottom: false };
    }

    const scrollableHeight = Math.max(0, contentHeight - viewportHeight);
    // An offset beyond the current end cannot be where the user is: the list shrank
    // (a replaced search, removed rows) around them, so they are at the end now.
    // Capping the offset for the *decision* only -- instead of rewriting the stored
    // geometry -- keeps a transient dip in the reported content height recoverable:
    // the next scroll event is authoritative either way.
    const offsetFromTop = Math.min(offsetY, scrollableHeight);

    return {
        showScrollToTop: offsetFromTop > SHOW_AFTER_PX,
        showScrollToBottom: scrollableHeight - offsetFromTop > MIN_BOTTOM_DISTANCE_PX,
    };
};

export const useScrollAffordance = () => {
    // Latest geometry lives in a ref: every event is authoritative, so a decision can
    // never be recomputed from the stale snapshot that the last *rendered* one left.
    const metricsRef = useRef<ScrollMetrics>({ offsetY: 0, contentHeight: 0, viewportHeight: 0 });
    const [flags, setFlags] = useState<ScrollFlags>(() => decide(metricsRef.current));

    const applyMetrics = useCallback((next: Partial<ScrollMetrics>) => {
        const merged: ScrollMetrics = { ...metricsRef.current, ...next };
        metricsRef.current = merged;

        const decided = decide(merged);
        // Scroll and layout churn fire constantly; re-render only on a flip.
        setFlags((previous) =>
            previous.showScrollToTop === decided.showScrollToTop &&
            previous.showScrollToBottom === decided.showScrollToBottom
                ? previous
                : decided,
        );
    }, []);

    const onScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            applyMetrics({
                offsetY: contentOffset.y,
                contentHeight: contentSize.height,
                viewportHeight: layoutMeasurement.height,
            });
        },
        [applyMetrics],
    );

    const onContentSizeChange = useCallback(
        (_width: number, height: number) => applyMetrics({ contentHeight: height }),
        [applyMetrics],
    );

    const onViewportLayout = useCallback(
        (event: LayoutChangeEvent) =>
            applyMetrics({ viewportHeight: event.nativeEvent.layout.height }),
        [applyMetrics],
    );

    return {
        showScrollToTop: flags.showScrollToTop,
        showScrollToBottom: flags.showScrollToBottom,
        onScroll,
        onContentSizeChange,
        onViewportLayout,
        scrollEventThrottle: 32,
    };
};

type ScrollButtonsProps = {
    showScrollToTop: boolean;
    showScrollToBottom?: boolean;
    onScrollToTop: () => void;
    onScrollToBottom?: () => void;
    /**
     * Distance from the bottom edge. The list viewport already excludes the tab bar,
     * so a large value here left a visible dead band under the buttons; the default
     * keeps them just clear of the home indicator while both slots stay on the same
     * baseline: the column is anchored at `bottom`, so a smaller value moves both
     * buttons down by the same distance.
     */
    bottomOffset?: number;
};

const ScrollButtons = ({
    showScrollToTop,
    showScrollToBottom = false,
    onScrollToTop,
    onScrollToBottom,
    bottomOffset = 10,
}: ScrollButtonsProps) => {
    const opacity = useRef(new Animated.Value(0)).current;
    const visible = showScrollToTop || showScrollToBottom;

    React.useEffect(() => {
        Animated.timing(opacity, {
            toValue: visible ? 1 : 0,
            duration: 140,
            useNativeDriver: true,
        }).start();
    }, [opacity, visible]);

    if (!visible) {
        return null;
    }

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[localStyles.column, { bottom: bottomOffset, opacity }]}
        >
            {/* Each button owns a fixed slot instead of flowing in a column: when the
                bottom button went away the top one slid down into its place, which
                made it look like a different control. */}
            <View style={localStyles.slot}>
                {showScrollToTop && (
                    <Pressable
                        onPress={onScrollToTop}
                        accessibilityRole="button"
                        accessibilityLabel="Scroll back to the top"
                        hitSlop={8}
                        style={({ pressed }) => [localStyles.button, pressed && localStyles.pressed]}
                    >
                        <MaterialIcons name="keyboard-arrow-up" size={22} color="#E5E7EB" />
                    </Pressable>
                )}
            </View>
            <View style={[localStyles.slot, localStyles.bottomSlot]}>
                {showScrollToBottom && onScrollToBottom && (
                    <Pressable
                        onPress={onScrollToBottom}
                        accessibilityRole="button"
                        accessibilityLabel="Scroll to the end of the list"
                        hitSlop={8}
                        style={({ pressed }) => [localStyles.button, pressed && localStyles.pressed]}
                    >
                        <MaterialIcons name="keyboard-arrow-down" size={22} color="#E5E7EB" />
                    </Pressable>
                )}
            </View>
        </Animated.View>
    );
};

const localStyles = StyleSheet.create({
    column: {
        position: 'absolute',
        right: 18,
        alignItems: 'center',
    },
    slot: {
        // Fixed footprint: an empty slot still reserves the button's space.
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomSlot: {
        marginTop: 10,
    },
    button: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(32, 37, 45, 0.92)',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.28)',
        // Keeps the pill readable over artwork-heavy rows.
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
    },
    pressed: {
        backgroundColor: 'rgba(56, 189, 248, 0.22)',
        borderColor: theme.colors.externalLinks.accent,
    },
});

export default ScrollButtons;

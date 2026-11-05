import React, { useCallback, useRef, useState } from 'react';
import {
    Animated,
    Pressable,
    StyleSheet,
    View,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from '../styles/theme';

/**
 * Floating scroll affordances for long lists.
 *
 * Two deliberate constraints:
 *
 * - "Top" appears only after a real scroll (SHOW_AFTER_PX), so short lists never
 *   grow a button that does nothing.
 * - "Bottom" additionally needs a meaningful run left below the viewport
 *   (MIN_BOTTOM_DISTANCE_PX). Otherwise a list that is only a few rows taller than
 *   the screen would show two buttons offering the same tiny jump.
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

export const useScrollAffordance = () => {
    const [metrics, setMetrics] = useState<ScrollMetrics>({
        offsetY: 0,
        contentHeight: 0,
        viewportHeight: 0,
    });

    const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;

        setMetrics((previous) => {
            // Scroll fires constantly; only re-render when the *decision* changes.
            const next = {
                offsetY: contentOffset.y,
                contentHeight: contentSize.height,
                viewportHeight: layoutMeasurement.height,
            };

            const wasVisible = previous.offsetY > SHOW_AFTER_PX;
            const isVisible = next.offsetY > SHOW_AFTER_PX;
            const remainingBefore =
                previous.contentHeight - previous.viewportHeight - previous.offsetY;
            const remainingAfter = next.contentHeight - next.viewportHeight - next.offsetY;
            const couldScrollToBottom = remainingBefore > MIN_BOTTOM_DISTANCE_PX;
            const canScrollToBottom = remainingAfter > MIN_BOTTOM_DISTANCE_PX;

            if (wasVisible === isVisible && couldScrollToBottom === canScrollToBottom) {
                return previous;
            }

            return next;
        });
    }, []);

    const remaining = metrics.contentHeight - metrics.viewportHeight - metrics.offsetY;

    return {
        showScrollToTop: metrics.offsetY > SHOW_AFTER_PX,
        showScrollToBottom: metrics.offsetY > SHOW_AFTER_PX && remaining > MIN_BOTTOM_DISTANCE_PX,
        onScroll,
        scrollEventThrottle: 32,
    };
};

type ScrollButtonsProps = {
    showScrollToTop: boolean;
    showScrollToBottom?: boolean;
    onScrollToTop: () => void;
    onScrollToBottom?: () => void;
    /** Distance from the bottom edge; keeps the buttons clear of tab bars/footers. */
    bottomOffset?: number;
};

const ScrollButtons = ({
    showScrollToTop,
    showScrollToBottom = false,
    onScrollToTop,
    onScrollToBottom,
    bottomOffset = 24,
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

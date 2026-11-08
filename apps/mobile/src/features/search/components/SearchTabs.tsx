import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchTabsProps {
    scope: SearchScope;
    /** Result count per type; shown so the filter is informative, not just a label. */
    counts?: Partial<Record<SearchScope, number>>;
    /** Per-category loading state; loading tabs pulse like image placeholders until resolved. */
    loadingScopes?: Partial<Record<SearchScope, boolean>>;
    onScopeChange: (scope: SearchScope) => void;
}

/**
 * Counts come from the search endpoint. A query that hits the mirror's work budget
 * reports the budget as its count, so it is rendered with a trailing "+" instead of
 * pretending to be exact.
 */
const SEARCH_COUNT_BUDGET = 10_000;

const formatCount = (count: number | undefined): string => {
    if (count === undefined) {
        return '';
    }

    return count >= SEARCH_COUNT_BUDGET ? ' 10k+' : ` ${count.toLocaleString('en-US')}`;
};

const TABS: Array<{ scope: SearchScope; label: string }> = [
    { scope: 'artists', label: 'Artists' },
    { scope: 'releases', label: 'Releases' },
    { scope: 'tracks', label: 'Tracks' },
];

const SearchTabs = ({
    scope,
    counts = {},
    loadingScopes = {},
    onScopeChange,
}: SearchTabsProps) => {
    const anyLoading = Boolean(
        loadingScopes.artists || loadingScopes.releases || loadingScopes.tracks,
    );
    const progress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!anyLoading) {
            progress.setValue(0);
            return;
        }
        progress.setValue(0);
        const animation = Animated.loop(
            Animated.timing(progress, {
                toValue: 1,
                duration: 2200,
                easing: Easing.linear,
                useNativeDriver: true,
                isInteraction: false,
            }),
        );
        animation.start();
        return () => animation.stop();
    }, [anyLoading, progress]);

    const overlayOpacity = progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.16, 0.48, 0.16],
    });

    return (
        <View style={styles.row} accessibilityRole="tablist">
            {TABS.map((tab) => {
                const selected = tab.scope === scope;
                const count = counts[tab.scope];
                const isTabLoading = Boolean(loadingScopes[tab.scope]);
                // While a category is still loading, disable tapping it and pulse the pill;
                // once resolved, disable it if its count is 0.
                const disabled = !selected && (isTabLoading || count === 0);

                return (
                    <Pressable
                        key={tab.scope}
                        onPress={() => onScopeChange(tab.scope)}
                        disabled={disabled}
                        accessibilityRole="tab"
                        accessibilityState={{ selected, disabled, busy: isTabLoading }}
                        style={[
                            styles.tab,
                            isTabLoading && !selected && styles.tabLoading,
                            selected && styles.tabSelected,
                            !isTabLoading && disabled && styles.tabDisabled,
                        ]}
                    >
                        {isTabLoading && !selected && (
                            <Animated.View
                                pointerEvents="none"
                                style={[
                                    StyleSheet.absoluteFill,
                                    styles.tabPulseOverlay,
                                    { opacity: overlayOpacity },
                                ]}
                            />
                        )}
                        <Text
                            style={[
                                styles.tabText,
                                isTabLoading && !selected && styles.tabTextLoading,
                                selected && styles.tabTextSelected,
                            ]}
                        >
                            {tab.label}
                            {isTabLoading ? '' : formatCount(count)}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    tabLoading: {
        backgroundColor: '#20252d',
        borderColor: 'rgba(148, 163, 184, 0.24)',
    },
    tabPulseOverlay: {
        backgroundColor: '#6d7d90',
        borderRadius: 999,
    },
    tabDisabled: {
        opacity: 0.4,
    },
    tabSelected: {
        backgroundColor: 'rgba(56, 189, 248, 0.18)',
        borderColor: 'rgba(56, 189, 248, 0.52)',
    },
    tabText: {
        color: theme.colors.textMuted,
        fontSize: 14,
        fontWeight: '600',
    },
    tabTextLoading: {
        color: '#cbd5e1',
    },
    tabTextSelected: {
        color: '#81ddff',
    },
});

export default SearchTabs;

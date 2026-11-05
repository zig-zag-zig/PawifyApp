import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchTabsProps {
    scope: SearchScope;
    /** Result count per type; shown so the filter is informative, not just a label. */
    counts?: Partial<Record<SearchScope, number>>;
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

const SearchTabs = ({ scope, counts = {}, onScopeChange }: SearchTabsProps) => (
    <View style={styles.row} accessibilityRole="tablist">
        {TABS.map((tab) => {
            const selected = tab.scope === scope;
            const count = counts[tab.scope];
            // A filter with nothing behind it is dead weight: disable it instead of
            // letting the user land on an empty list.
            const disabled = !selected && count === 0;

            return (
                <Pressable
                    key={tab.scope}
                    onPress={() => onScopeChange(tab.scope)}
                    disabled={disabled}
                    accessibilityRole="tab"
                    accessibilityState={{ selected, disabled }}
                    style={[styles.tab, selected && styles.tabSelected, disabled && styles.tabDisabled]}
                >
                    <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                        {tab.label}
                        {formatCount(counts[tab.scope])}
                    </Text>
                </Pressable>
            );
        })}
    </View>
);

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
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
    tabTextSelected: {
        color: '#81ddff',
    },
});

export default SearchTabs;

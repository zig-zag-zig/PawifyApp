import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchTabsProps {
    scope: SearchScope;
    counts?: Partial<Record<SearchScope, number>>;
    onScopeChange: (scope: SearchScope) => void;
}

const TABS: Array<{ scope: SearchScope; label: string }> = [
    { scope: 'all', label: 'All' },
    { scope: 'artists', label: 'Artists' },
    { scope: 'releases', label: 'Releases' },
    { scope: 'tracks', label: 'Tracks' },
];

const SearchTabs = ({ scope, counts = {}, onScopeChange }: SearchTabsProps) => (
    <View style={styles.row} accessibilityRole="tablist">
        {TABS.map((tab) => {
            const selected = tab.scope === scope;
            const count = counts[tab.scope];
            const disabled = count === 0 && scope !== 'all';
            return (
                <Pressable
                    key={tab.scope}
                    onPress={() => onScopeChange(tab.scope)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    style={[styles.tab, selected && styles.tabSelected, disabled && styles.tabDisabled]}
                >
                    <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                        {tab.label}{count !== undefined ? ` (${count > 99 ? '99+' : count})` : ''}
                    </Text>
                </Pressable>
            );
        })}
    </View>
);

const styles = StyleSheet.create({
    row: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
    tabSelected: { backgroundColor: 'rgba(56, 189, 248, 0.18)', borderColor: 'rgba(56, 189, 248, 0.52)' },
    tabDisabled: { opacity: 0.35 },
    tabText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
    tabTextSelected: { color: '#81ddff' },
});

export default SearchTabs;

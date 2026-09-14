import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchTabsProps {
    scope: SearchScope;
    onScopeChange: (scope: SearchScope) => void;
}

const TABS: Array<{ scope: SearchScope; label: string }> = [
    { scope: 'artists', label: 'Artists' },
    { scope: 'releases', label: 'Releases' },
];

const SearchTabs = ({ scope, onScopeChange }: SearchTabsProps) => (
    <View style={styles.row} accessibilityRole="tablist">
        {TABS.map((tab) => {
            const selected = tab.scope === scope;
            return (
                <Pressable
                    key={tab.scope}
                    onPress={() => onScopeChange(tab.scope)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    style={[styles.tab, selected && styles.tabSelected]}
                >
                    <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                        {tab.label}
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

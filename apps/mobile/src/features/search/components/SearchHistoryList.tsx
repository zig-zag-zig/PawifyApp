import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { SearchHistoryEntry, SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchHistoryListProps {
    entries: SearchHistoryEntry[];
    scope: SearchScope;
    onEntryPress: (entry: SearchHistoryEntry) => void;
    onClear: () => void;
}

const SearchHistoryList = ({
    entries,
    scope,
    onEntryPress,
    onClear,
}: SearchHistoryListProps) => {
    const scopedEntries = entries.filter((entry) => entry.scope === scope);

    if (scopedEntries.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <View style={styles.headerRow}>
                <Text style={styles.header}>Recent searches</Text>
                <Pressable
                    onPress={onClear}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search history"
                    hitSlop={8}
                >
                    <Text style={styles.clear}>Clear</Text>
                </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {scopedEntries.map((entry) => (
                    <Pressable
                        key={`${entry.scope}:${entry.query}`}
                        onPress={() => onEntryPress(entry)}
                        accessibilityRole="button"
                        accessibilityLabel={`Search again for ${entry.query}`}
                        style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
                    >
                        <MaterialIcons name="history" size={16} color={theme.colors.textMuted} />
                        <Text style={styles.entryText} numberOfLines={1} ellipsizeMode="tail">
                            {entry.query}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 4,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    header: {
        color: theme.colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    clear: {
        color: '#81ddff',
        fontSize: 13,
        fontWeight: '600',
    },
    entry: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
    },
    entryPressed: {
        opacity: 0.7,
    },
    entryText: {
        color: theme.colors.textSoft,
        fontSize: 15,
        flex: 1,
    },
});

export default SearchHistoryList;

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { SearchHistoryEntry, SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchHistoryListProps {
    entries: SearchHistoryEntry[];
    scope: SearchScope;
    onEntryPress: (entry: SearchHistoryEntry) => void;
    onEntryRemove: (entry: SearchHistoryEntry) => void;
    onClear: () => void;
    fill?: boolean;
}

/**
 * The chip is a row of two press targets rather than a pressable chip with a
 * pressable child, so the label (search again) and the close affordance
 * (remove just this entry) never fight over the same touch.
 */
const SearchHistoryList = ({
    entries,
    scope,
    onEntryPress,
    onEntryRemove,
    onClear,
    fill = true,
}: SearchHistoryListProps) => {
    const scopedEntries = entries.filter((entry) => entry.scope === scope);

    if (scopedEntries.length === 0) {
        return null;
    }

    return (
        <View style={[styles.container, !fill && styles.compactContainer]}>
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
            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chipScrollContent}
            >
                <View style={styles.chipRow}>
                    {scopedEntries.map((entry) => (
                        <View
                            key={`${entry.scope}:${entry.query}`}
                            style={styles.chip}
                        >
                            <Pressable
                                onPress={() => onEntryPress(entry)}
                                accessibilityRole="button"
                                accessibilityLabel={`Search again for ${entry.query}`}
                                style={({ pressed }) => [
                                    styles.chipLabel,
                                    pressed && styles.chipPressed,
                                ]}
                            >
                                <Text
                                    style={styles.chipText}
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                >
                                    {entry.query}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={() => onEntryRemove(entry)}
                                accessibilityRole="button"
                                accessibilityLabel={`Remove ${entry.query} from recent searches`}
                                hitSlop={10}
                                style={({ pressed }) => [
                                    styles.chipRemove,
                                    pressed && styles.chipPressed,
                                ]}
                            >
                                <MaterialIcons
                                    name="close"
                                    size={16}
                                    color={theme.colors.iconMuted}
                                />
                            </Pressable>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: 4,
    },
    compactContainer: {
        flex: 0,
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
    chipScrollContent: {
        paddingBottom: 4,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        paddingLeft: 12,
        paddingRight: 2,
    },
    chipLabel: {
        paddingVertical: 7,
    },
    chipRemove: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipPressed: {
        opacity: 0.6,
    },
    chipText: {
        color: theme.colors.textSoft,
        fontSize: 14,
        maxWidth: 180,
    },
});

export default SearchHistoryList;

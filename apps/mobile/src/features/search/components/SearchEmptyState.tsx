import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchEmptyStateProps {
    scope: SearchScope;
    /** True when recent searches render below it — keeps it from filling the screen. */
    compact?: boolean;
    /** Whether a submitted query produced no results. */
    noResults?: boolean;
}

/**
 * Shown when the query is empty so the tab explains what it searches instead
 * of rendering an empty screen. Deliberately plain: a muted icon and a single
 * line. With history above it, it centres in the space that is left over.
 */
/**
 * Empty-state copy is deliberately not per-tab: tabs are hidden until a search has
 * run, and the search itself is type-agnostic.
 */
const CONTENT_BY_SCOPE: Record<SearchScope, { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }> = {
    artists: { icon: 'search', label: 'Search artists, releases, and tracks' },
    releases: { icon: 'search', label: 'Search artists, releases, and tracks' },
    tracks: { icon: 'search', label: 'Search artists, releases, and tracks' },
};

const SearchEmptyState = ({ scope, compact = false, noResults = false }: SearchEmptyStateProps) => {
    const { icon, label } = CONTENT_BY_SCOPE[scope];
    const message = noResults ? 'No results found' : label;

    return (
        <View style={[styles.container, compact ? styles.compact : styles.full]}>
            <MaterialIcons name={icon} size={compact ? 28 : 36} color={theme.colors.textMuted} />
            <Text style={styles.label}>{message}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    full: {
        flex: 1,
        paddingBottom: 48,
    },
    compact: {
        flex: 1,
        paddingBottom: 24,
    },
    label: {
        color: theme.colors.textMuted,
        fontSize: 14,
    },
});

export default SearchEmptyState;

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { SearchScope } from '../../../services/searchHistoryStorage';
import { theme } from '../../../styles/theme';

interface SearchEmptyStateProps {
    scope: SearchScope;
}

/**
 * Shown when there is no query and nothing in recent searches, so the tab
 * explains what it searches instead of rendering an empty screen. Deliberately
 * plain: a muted icon and a single line.
 */
const CONTENT_BY_SCOPE: Record<
    SearchScope,
    { icon: React.ComponentProps<typeof MaterialIcons>['name']; label: string }
> = {
    artists: { icon: 'person-search', label: 'Find an artist to follow' },
    releases: { icon: 'album', label: 'Find a release to explore' },
};

const SearchEmptyState = ({ scope }: SearchEmptyStateProps) => {
    const { icon, label } = CONTENT_BY_SCOPE[scope];

    return (
        <View style={styles.container}>
            <MaterialIcons name={icon} size={36} color={theme.colors.textMuted} />
            <Text style={styles.label}>{label}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 48,
        gap: 12,
    },
    label: {
        color: theme.colors.textMuted,
        fontSize: 14,
    },
});

export default SearchEmptyState;

import React, { memo, useCallback, useMemo } from 'react';
import { FlatList, ListRenderItem, Pressable, StyleSheet, Text, View } from 'react-native';
import { InlineLink, Spinner } from '../../../components/ui';
import { useContentReady } from '../../../hooks/useContentReady';
import type { ReleaseGroupSearchResultItem } from '../../../types/apiTypes';
import { theme } from '../../../styles/theme';

interface ReleaseGroupSearchResultsProps {
    releaseGroups: ReleaseGroupSearchResultItem[];
    isLoading: boolean;
    canLoadMore: boolean;
    onLoadMore: () => void;
    onReleaseGroupPress: (releaseGroupId: string) => void;
}

type ListItem =
    | { type: 'releaseGroup'; releaseGroup: ReleaseGroupSearchResultItem }
    | { type: 'footer' };

const ReleaseGroupResultItem = memo(({
    releaseGroup,
    onReleaseGroupPress,
}: {
    releaseGroup: ReleaseGroupSearchResultItem;
    onReleaseGroupPress: (releaseGroupId: string) => void;
}) => {
    const handlePress = useCallback(() => {
        onReleaseGroupPress(releaseGroup.id);
    }, [releaseGroup.id, onReleaseGroupPress]);

    const artistNames = useMemo(
        () =>
            (releaseGroup['artist-credit'] ?? [])
                .map((credit) => `${credit.name}${credit.joinphrase ?? ''}`)
                .join('')
                .trim(),
        [releaseGroup],
    );

    const metaLine = [
        releaseGroup['primary-type'],
        releaseGroup['first-release-date']?.slice(0, 4),
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`Open release group ${releaseGroup.title}${artistNames ? ` by ${artistNames}` : ''}`}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        >
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                {releaseGroup.title}
            </Text>
            {artistNames.length > 0 && (
                <Text style={styles.artists} numberOfLines={1} ellipsizeMode="tail">
                    {artistNames}
                </Text>
            )}
            {metaLine.length > 0 && <Text style={styles.meta}>{metaLine}</Text>}
        </Pressable>
    );
});

ReleaseGroupResultItem.displayName = 'ReleaseGroupResultItem';

const ReleaseGroupSearchResults = ({
    releaseGroups,
    isLoading,
    canLoadMore,
    onLoadMore,
    onReleaseGroupPress,
}: ReleaseGroupSearchResultsProps) => {
    const listData = useMemo<ListItem[]>(() => [
        ...releaseGroups.map((releaseGroup): ListItem => ({ type: 'releaseGroup', releaseGroup })),
        ...(canLoadMore || (isLoading && releaseGroups.length > 0)
            ? [{ type: 'footer' as const }]
            : []),
    ], [releaseGroups, canLoadMore, isLoading]);

    const isInitialLoading = isLoading && releaseGroups.length === 0;
    const { isWaitingForContent, onContentReady } = useContentReady(
        isInitialLoading,
        releaseGroups.length > 0
    );

    const renderLoadMore = useCallback(() => {
        if (canLoadMore || isLoading) {
            return (
                <InlineLink onPress={onLoadMore} isLoading={isLoading}>
                    Load more
                </InlineLink>
            );
        }

        return null;
    }, [canLoadMore, isLoading, onLoadMore]);

    const renderItem = useCallback<ListRenderItem<ListItem>>(({ item }) => {
        if (item.type === 'footer') {
            return renderLoadMore();
        }

        return (
            <ReleaseGroupResultItem
                releaseGroup={item.releaseGroup}
                onReleaseGroupPress={onReleaseGroupPress}
            />
        );
    }, [onReleaseGroupPress, renderLoadMore]);

    return (
        <View style={styles.results}>
            <FlatList
                data={listData}
                keyExtractor={(item) =>
                    item.type === 'footer' ? 'release-search-load-more-footer' : item.releaseGroup.id
                }
                extraData={{ isLoading, canLoadMore }}
                style={styles.list}
                contentContainerStyle={[
                    styles.contentContainer,
                    releaseGroups.length === 0 && styles.emptyContentContainer,
                ]}
                showsVerticalScrollIndicator={false}
                renderItem={renderItem}
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                updateCellsBatchingPeriod={16}
                windowSize={11}
                removeClippedSubviews={false}
                onContentSizeChange={onContentReady}
            />
            <Spinner isLoading={isInitialLoading || isWaitingForContent} backdropVariant="strong" />
        </View>
    );
};

const styles = StyleSheet.create({
    results: {
        flex: 1,
    },
    list: {
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 14,
    },
    emptyContentContainer: {
        flexGrow: 1,
    },
    item: {
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    itemPressed: {
        opacity: 0.7,
    },
    title: {
        color: theme.colors.text,
        fontSize: 15,
        fontWeight: '600',
    },
    artists: {
        color: theme.colors.textSoft,
        fontSize: 13,
        marginTop: 2,
    },
    meta: {
        color: theme.colors.textMuted,
        fontSize: 12,
        marginTop: 2,
    },
});

export default ReleaseGroupSearchResults;

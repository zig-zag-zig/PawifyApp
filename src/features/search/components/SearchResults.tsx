import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import ArtistMinimalCard from '../../../components/ArtistMinimalCard';
import { InlineLink, Spinner } from '../../../components/ui';
import { useContentReady } from '../../../hooks/useContentReady';
import { Artist } from '../../../shared/music';

interface SearchResultsProps {
    artists: Artist[];
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isLoading: boolean;
    canLoadMore: boolean;
    onLoadMore: () => void;
    onArtistPress: (artistId: string) => void;
}

interface SearchResultItemProps {
    artist: Artist;
    profileImageUrl?: string | null;
    isProfileImagePending: boolean;
    onArtistPress: (artistId: string) => void;
}

type SearchListItem =
    | { type: 'artist'; artist: Artist }
    | { type: 'footer' };

const SearchResultItem = memo(({
    artist,
    profileImageUrl,
    isProfileImagePending,
    onArtistPress,
}: SearchResultItemProps) => {
    const handlePress = useCallback(() => {
        onArtistPress(artist.id);
    }, [artist.id, onArtistPress]);

    return (
        <ArtistMinimalCard
            artist={artist}
            profileImageUrl={profileImageUrl}
            showProfileImageSpinnerWhenMissing={isProfileImagePending}
            showDisambiguation={true}
            onPress={handlePress}
        />
    );
});

SearchResultItem.displayName = 'SearchResultItem';

const SearchResults = ({
    artists,
    artistProfileImages,
    pendingArtistImageIds,
    isLoading,
    canLoadMore,
    onLoadMore,
    onArtistPress
}: SearchResultsProps) => {
    const pendingArtistImageIdSet = useMemo(
        () => new Set(pendingArtistImageIds),
        [pendingArtistImageIds]
    );
    const listData = useMemo<SearchListItem[]>(() => [
        ...artists.map((artist): SearchListItem => ({ type: 'artist', artist })),
        ...(canLoadMore || (isLoading && artists.length > 0) ? [{ type: 'footer' as const }] : []),
    ], [artists, canLoadMore, isLoading]);
    const spinnerColor = '#FFF';
    const isInitialLoading = isLoading && artists.length === 0;
    const { isWaitingForContent, onContentReady } = useContentReady(
        isInitialLoading,
        artists.length > 0
    );

    const renderLoadMore = useCallback(() => {
        if (isLoading) {
            return (
                <View style={styles.footerSpinner}>
                    <ActivityIndicator size="small" color={spinnerColor} />
                    <Text style={[styles.footerText, { color: spinnerColor }]}>Loading more</Text>
                </View>
            );
        }

        if (canLoadMore) {
            return <InlineLink onPress={onLoadMore}>Load more</InlineLink>;
        }

        return null;
    }, [canLoadMore, isLoading, onLoadMore, spinnerColor]);

    const renderItem = useCallback<ListRenderItem<SearchListItem>>(({ item }) => {
        if (item.type === 'footer') {
            return renderLoadMore();
        }

        return (
            <SearchResultItem
                artist={item.artist}
                profileImageUrl={artistProfileImages[item.artist.id]}
                isProfileImagePending={pendingArtistImageIdSet.has(item.artist.id)}
                onArtistPress={onArtistPress}
            />
        );
    }, [artistProfileImages, onArtistPress, pendingArtistImageIdSet, renderLoadMore]);

    return (
        <View style={styles.results}>
            <FlatList
                data={listData}
                keyExtractor={(item) => item.type === 'footer' ? 'search-load-more-footer' : item.artist.id}
                extraData={{
                    artistProfileImages,
                    pendingArtistImageIds,
                    isLoading,
                    canLoadMore,
                }}
                style={styles.list}
                contentContainerStyle={[
                    styles.contentContainer,
                    artists.length === 0 && styles.emptyContentContainer,
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
    footerSpinner: {
        minHeight: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    footerText: {
        fontSize: 14,
        fontWeight: '600',
    },
});

export default memo(SearchResults);

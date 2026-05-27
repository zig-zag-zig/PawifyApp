import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, ListRenderItem, StyleSheet, Text, View } from 'react-native';
import ArtistMinimalCard from '../../../components/ArtistMinimalCard';
import { TouchableText } from '../../../components/StyledComponents';
import { Artist } from '../../../modules/models/models';

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
            return <TouchableText onPress={onLoadMore}>Load more</TouchableText>;
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

    const renderEmpty = useCallback(() => {
        if (!isLoading) {
            return null;
        }

        return (
            <View style={styles.emptyLoader}>
                <ActivityIndicator size="large" color={spinnerColor} />
            </View>
        );
    }, [isLoading, spinnerColor]);

    return (
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
            ListEmptyComponent={renderEmpty}
            initialNumToRender={20}
            maxToRenderPerBatch={20}
            updateCellsBatchingPeriod={16}
            windowSize={11}
            removeClippedSubviews={false}
        />
    );
};

const styles = StyleSheet.create({
    list: {
        flex: 1,
    },
    contentContainer: {
        paddingBottom: 14,
    },
    emptyContentContainer: {
        flexGrow: 1,
    },
    emptyLoader: {
        flex: 1,
        minHeight: 240,
        alignItems: 'center',
        justifyContent: 'center',
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

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenContainer } from '../../../components/ui';
import type { Artist } from '@pawify/shared';
import SearchInput from './SearchInput';
import SearchResults from './SearchResults';

interface SearchViewProps {
    query: string;
    artists: Artist[];
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isLoading: boolean;
    canLoadMore: boolean;
    onQueryChanged: (query: string) => void;
    onSubmitSearch: (query?: string) => Promise<void>;
    onLoadMore: () => Promise<void>;
    onArtistPressed: (artistId: string) => void;
}

const SearchView = ({
    query,
    artists,
    artistProfileImages,
    pendingArtistImageIds,
    isLoading,
    canLoadMore,
    onQueryChanged,
    onSubmitSearch,
    onLoadMore,
    onArtistPressed,
}: SearchViewProps) => {
    return (
        <ScreenContainer>
            <View style={styles.searchInputContainer}>
                <SearchInput
                    query={query}
                    onChangeText={onQueryChanged}
                    onSubmitEditing={(submittedQuery) => void onSubmitSearch(submittedQuery)}
                />
            </View>
            <SearchResults
                artists={artists}
                artistProfileImages={artistProfileImages}
                pendingArtistImageIds={pendingArtistImageIds}
                isLoading={isLoading}
                canLoadMore={canLoadMore}
                onLoadMore={() => void onLoadMore()}
                onArtistPress={onArtistPressed}
            />
        </ScreenContainer>
    );
};

const styles = StyleSheet.create({
    searchInputContainer: {
        marginHorizontal: -10,
    },
});

export default SearchView;

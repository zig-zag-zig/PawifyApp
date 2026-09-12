import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenContainer } from '../../../components/ui';
import type { Artist } from '@pawify/shared';
import type { ReleaseGroupSearchResultItem } from '../../../types/apiTypes';
import type { SearchHistoryEntry, SearchScope } from '../../../services/searchHistoryStorage';
import SearchInput from './SearchInput';
import SearchResults from './SearchResults';
import SearchTabs from './SearchTabs';
import SearchHistoryList from './SearchHistoryList';
import ReleaseGroupSearchResults from './ReleaseGroupSearchResults';

interface SearchViewProps {
    query: string;
    scope: SearchScope;
    history: SearchHistoryEntry[];
    artists: Artist[];
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isArtistsLoading: boolean;
    canLoadMoreArtists: boolean;
    releaseGroups: ReleaseGroupSearchResultItem[];
    isReleasesLoading: boolean;
    canLoadMoreReleaseGroups: boolean;
    onQueryChanged: (query: string) => void;
    onScopeChanged: (scope: SearchScope) => void;
    onSubmitSearch: (query?: string) => Promise<void>;
    onLoadMoreArtists: () => Promise<void>;
    onLoadMoreReleaseGroups: () => Promise<void>;
    onArtistPressed: (artistId: string) => void;
    onReleaseGroupPressed: (releaseGroupId: string) => void;
    onHistoryEntryPressed: (entry: SearchHistoryEntry) => void;
    onClearHistory: () => void;
}

const SearchView = ({
    query,
    scope,
    history,
    artists,
    artistProfileImages,
    pendingArtistImageIds,
    isArtistsLoading,
    canLoadMoreArtists,
    releaseGroups,
    isReleasesLoading,
    canLoadMoreReleaseGroups,
    onQueryChanged,
    onScopeChanged,
    onSubmitSearch,
    onLoadMoreArtists,
    onLoadMoreReleaseGroups,
    onArtistPressed,
    onReleaseGroupPressed,
    onHistoryEntryPressed,
    onClearHistory,
}: SearchViewProps) => {
    const showHistory = query.trim().length === 0;

    return (
        <ScreenContainer>
            <View style={styles.searchInputContainer}>
                <SearchInput
                    query={query}
                    onChangeText={onQueryChanged}
                    onSubmitEditing={(submittedQuery) => void onSubmitSearch(submittedQuery)}
                />
            </View>
            <SearchTabs scope={scope} onScopeChange={onScopeChanged} />
            {showHistory ? (
                <SearchHistoryList
                    entries={history}
                    scope={scope}
                    onEntryPress={onHistoryEntryPressed}
                    onClear={onClearHistory}
                />
            ) : scope === 'artists' ? (
                <SearchResults
                    artists={artists}
                    artistProfileImages={artistProfileImages}
                    pendingArtistImageIds={pendingArtistImageIds}
                    isLoading={isArtistsLoading}
                    canLoadMore={canLoadMoreArtists}
                    onLoadMore={() => void onLoadMoreArtists()}
                    onArtistPress={onArtistPressed}
                />
            ) : (
                <ReleaseGroupSearchResults
                    releaseGroups={releaseGroups}
                    isLoading={isReleasesLoading}
                    canLoadMore={canLoadMoreReleaseGroups}
                    onLoadMore={() => void onLoadMoreReleaseGroups()}
                    onReleaseGroupPress={onReleaseGroupPressed}
                />
            )}
        </ScreenContainer>
    );
};

const styles = StyleSheet.create({
    searchInputContainer: {
        marginHorizontal: -10,
        marginBottom: 10,
    },
});

export default SearchView;

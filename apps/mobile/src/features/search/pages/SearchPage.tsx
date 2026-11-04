import React, { useCallback, useEffect, useState } from 'react';
import SearchView from '../components/SearchView';
import { useUnifiedSearch } from '../hooks/useUnifiedSearch';
import {
    clearSearchHistory,
    loadSearchHistory,
    removeSearchHistoryEntry,
    type SearchHistoryEntry,
    type SearchScope,
} from '../../../services/searchHistoryStorage';

const SearchPage = () => {
    const search = useUnifiedSearch();
    const [scope, setScope] = useState<SearchScope>('all');
    const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

    const refreshHistory = useCallback(async () => setHistory(await loadSearchHistory()), []);
    useEffect(() => { void refreshHistory(); }, [refreshHistory]);

    const onHistoryEntryPressed = useCallback((entry: SearchHistoryEntry) => {
        setScope(entry.scope);
        search.onQueryChanged(entry.query);
        void search.onSubmitSearch(entry.query);
    }, [search]);

    const onHistoryEntryRemoved = useCallback((entry: SearchHistoryEntry) => {
        void removeSearchHistoryEntry(entry.query, entry.scope).then(refreshHistory);
    }, [refreshHistory]);

    const onClearHistory = useCallback(() => {
        void clearSearchHistory(scope).then(refreshHistory);
    }, [refreshHistory, scope]);

    return (
        <SearchView
            query={search.state.query}
            scope={scope}
            history={history}
            artists={search.state.artists}
            artistCount={search.state.artistCount}
            artistProfileImages={search.state.artistProfileImages}
            pendingArtistImageIds={[]}
            isArtistsLoading={search.state.isLoading}
            canLoadMoreArtists={!search.state.allResultsFetched && search.state.artists.length > 0}
            releaseGroups={search.state.releaseGroups}
            releaseGroupCount={search.state.releaseGroupCount}
            releaseGroupCovers={search.state.releaseGroupCovers}
            pendingReleaseGroupCoverIds={[]}
            isReleasesLoading={search.state.isLoading}
            canLoadMoreReleaseGroups={!search.state.allResultsFetched && search.state.releaseGroups.length > 0}
            tracks={search.state.tracks}
            trackCount={search.state.trackCount}
            isTracksLoading={search.state.isLoading}
            onQueryChanged={search.onQueryChanged}
            onScopeChanged={setScope}
            onSubmitSearch={search.onSubmitSearch}
            onLoadMoreArtists={search.onLoadMore}
            onLoadMoreReleaseGroups={search.onLoadMore}
            onArtistPressed={search.onArtistPressed}
            onReleaseGroupPressed={search.onReleaseGroupPressed}
            onHistoryEntryPressed={onHistoryEntryPressed}
            onHistoryEntryRemoved={onHistoryEntryRemoved}
            onClearHistory={onClearHistory}
            hasSubmittedNoResults={
                search.state.submittedQuery.trim().length >= 2 &&
                !search.state.isLoading &&
                search.state.artists.length === 0 &&
                search.state.releaseGroups.length === 0 &&
                search.state.tracks.length === 0
            }
        />
    );
};

export default SearchPage;

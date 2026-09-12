import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import SearchView from '../components/SearchView';
import { useSearchPage } from '../hooks/useSearchPage';
import { useReleaseGroupSearch } from '../hooks/useReleaseGroupSearch';
import {
    clearSearchHistory,
    loadSearchHistory,
    type SearchHistoryEntry,
    type SearchScope,
} from '../../../services/searchHistoryStorage';

const SearchPage = () => {
    const searchPage = useSearchPage();
    const releaseGroupSearch = useReleaseGroupSearch();
    const [scope, setScope] = useState<SearchScope>('artists');
    const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

    const refreshHistory = useCallback(async () => {
        setHistory(await loadSearchHistory());
    }, []);

    useEffect(() => {
        void refreshHistory();
    }, [refreshHistory]);

    // Searches write history from inside the hooks; refresh whenever the page
    // regains focus or a search completes so the list stays current.
    useFocusEffect(
        useCallback(() => {
            void refreshHistory();
        }, [refreshHistory])
    );

    useEffect(() => {
        if (!searchPage.state.isLoading) {
            void refreshHistory();
        }
    }, [searchPage.state.isLoading, refreshHistory]);

    useEffect(() => {
        if (!releaseGroupSearch.state.isLoading) {
            void refreshHistory();
        }
    }, [releaseGroupSearch.state.isLoading, refreshHistory]);

    const onSubmitSearch = useCallback(
        async (query?: string) => {
            if (scope === 'artists') {
                await searchPage.onSubmitSearch(query);
            } else {
                await releaseGroupSearch.onSubmitSearch(query ?? searchPage.state.query);
            }
        },
        [scope, searchPage, releaseGroupSearch],
    );

    const onHistoryEntryPressed = useCallback(
        (entry: SearchHistoryEntry) => {
            searchPage.onQueryChanged(entry.query);
            setScope(entry.scope);
            void (entry.scope === 'artists'
                ? searchPage.onSubmitSearch(entry.query)
                : releaseGroupSearch.onSubmitSearch(entry.query));
        },
        [searchPage, releaseGroupSearch],
    );

    const onClearHistory = useCallback(() => {
        void clearSearchHistory(scope).then(refreshHistory);
    }, [refreshHistory, scope]);

    return (
        <SearchView
            query={searchPage.state.query}
            scope={scope}
            history={history}
            artists={searchPage.state.artists}
            artistProfileImages={searchPage.state.artistProfileImages}
            pendingArtistImageIds={searchPage.state.pendingArtistImageIds}
            isArtistsLoading={searchPage.state.isLoading}
            canLoadMoreArtists={searchPage.state.canLoadMore}
            releaseGroups={releaseGroupSearch.state.releaseGroups}
            isReleasesLoading={releaseGroupSearch.state.isLoading}
            canLoadMoreReleaseGroups={releaseGroupSearch.canLoadMore}
            onQueryChanged={searchPage.onQueryChanged}
            onScopeChanged={setScope}
            onSubmitSearch={onSubmitSearch}
            onLoadMoreArtists={searchPage.onLoadMore}
            onLoadMoreReleaseGroups={releaseGroupSearch.onLoadMore}
            onArtistPressed={searchPage.onArtistPressed}
            onReleaseGroupPressed={releaseGroupSearch.onReleaseGroupPressed}
            onHistoryEntryPressed={onHistoryEntryPressed}
            onClearHistory={onClearHistory}
        />
    );
};

export default SearchPage;

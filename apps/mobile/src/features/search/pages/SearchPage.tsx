import React, { useCallback, useEffect, useRef, useState } from 'react';
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
    const [scope, setScope] = useState<SearchScope>('artists');
    const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
    const autoSelectedSequenceRef = useRef<number>(-1);

    const refreshHistory = useCallback(async () => setHistory(await loadSearchHistory()), []);

    useEffect(() => {
        void refreshHistory();
    }, [refreshHistory]);

    useEffect(() => {
        if (
            search.state.firstLoadedScope &&
            autoSelectedSequenceRef.current !== search.searchSequence
        ) {
            autoSelectedSequenceRef.current = search.searchSequence;
            setScope(search.state.firstLoadedScope);
        }
    }, [search.searchSequence, search.state.firstLoadedScope]);

    const onHistoryEntryPressed = useCallback(
        (entry: SearchHistoryEntry) => {
            setScope(entry.scope);
            search.onQueryChanged(entry.query);
            void search.onSubmitSearch(entry.query);
        },
        [search],
    );

    const onHistoryEntryRemoved = useCallback(
        (entry: SearchHistoryEntry) => {
            void removeSearchHistoryEntry(entry.query, entry.scope).then(refreshHistory);
        },
        [refreshHistory],
    );

    const onClearHistory = useCallback(() => {
        void clearSearchHistory(scope).then(refreshHistory);
    }, [refreshHistory, scope]);

    return (
        <SearchView
            query={search.state.query}
            scope={scope}
            hasSubmittedSearch={search.state.hasSubmittedSearch}
            history={history}
            artists={search.state.artists.slice(0, search.state.artistVisible)}
            artistCount={search.state.artistCount}
            releaseGroupCount={search.state.releaseGroupCount}
            trackCount={search.state.trackCount}
            artistProfileImages={search.state.artistProfileImages}
            pendingArtistImageIds={search.state.pendingArtistImageIds}
            isArtistsLoading={search.state.isLoadingArtists}
            canLoadMoreArtists={
                search.state.artistVisible < search.state.artists.length ||
                (!search.state.artistsAllFetched && search.state.artists.length > 0)
            }
            releaseGroups={search.state.releaseGroups.slice(0, search.state.releaseGroupVisible)}
            releaseGroupCovers={search.state.releaseGroupCovers}
            pendingReleaseGroupCoverIds={search.state.pendingReleaseGroupCoverIds}
            isReleasesLoading={search.state.isLoadingReleaseGroups}
            canLoadMoreReleaseGroups={
                search.state.releaseGroupVisible < search.state.releaseGroups.length ||
                (!search.state.releaseGroupsAllFetched && search.state.releaseGroups.length > 0)
            }
            tracks={search.state.tracks.slice(0, search.state.trackVisible)}
            trackCovers={search.state.trackCovers}
            pendingTrackCoverIds={search.state.pendingTrackCoverIds}
            isTracksLoading={search.state.isLoadingTracks}
            canLoadMoreTracks={
                search.state.trackVisible < search.state.tracks.length ||
                (!search.state.tracksAllFetched && search.state.tracks.length > 0)
            }
            onQueryChanged={search.onQueryChanged}
            onScopeChanged={setScope}
            onSubmitSearch={search.onSubmitSearch}
            onLoadMoreArtists={search.onLoadMoreArtists}
            onLoadMoreReleaseGroups={search.onLoadMoreReleaseGroups}
            onLoadMoreTracks={search.onLoadMoreTracks}
            onArtistPressed={search.onArtistPressed}
            onReleaseGroupPressed={search.onReleaseGroupPressed}
            onTrackPressed={search.onTrackPressed}
            onHistoryEntryPressed={onHistoryEntryPressed}
            onHistoryEntryRemoved={onHistoryEntryRemoved}
            onClearHistory={onClearHistory}
            hasSubmittedNoResults={
                search.state.hasSubmittedSearch &&
                !search.state.isLoading &&
                search.state.artists.length === 0 &&
                search.state.releaseGroups.length === 0 &&
                search.state.tracks.length === 0
            }
        />
    );
};

export default SearchPage;
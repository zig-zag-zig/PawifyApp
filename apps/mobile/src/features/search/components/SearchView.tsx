import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../../../components/ui';
import type { Artist } from '@pawify/shared';
import type { ReleaseGroupSearchResultItem } from '../../../types/apiTypes';
import type { UnifiedTrackResult } from '../model/unifiedTypes';
import type { SearchHistoryEntry, SearchScope } from '../../../services/searchHistoryStorage';
import SearchInput from './SearchInput';
import SearchResults from './SearchResults';
import SearchTabs from './SearchTabs';
import SearchHistoryList from './SearchHistoryList';
import SearchEmptyState from './SearchEmptyState';
import ReleaseGroupSearchResults from './ReleaseGroupSearchResults';

interface SearchViewProps {
    query: string;
    scope: SearchScope;
    history: SearchHistoryEntry[];
    artists: Artist[];
    artistCount: number;
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isArtistsLoading: boolean;
    canLoadMoreArtists: boolean;
    releaseGroups: ReleaseGroupSearchResultItem[];
    releaseGroupCount: number;
    releaseGroupCovers: Record<string, string | null | undefined>;
    pendingReleaseGroupCoverIds: string[];
    isReleasesLoading: boolean;
    canLoadMoreReleaseGroups: boolean;
    tracks: UnifiedTrackResult[];
    trackCount: number;
    isTracksLoading: boolean;
    onQueryChanged: (query: string) => void;
    onScopeChanged: (scope: SearchScope) => void;
    onSubmitSearch: (query?: string) => Promise<void>;
    onLoadMoreArtists: () => Promise<void>;
    onLoadMoreReleaseGroups: () => Promise<void>;
    onArtistPressed: (artistId: string) => void;
    onReleaseGroupPressed: (releaseGroupId: string) => void;
    onHistoryEntryPressed: (entry: SearchHistoryEntry) => void;
    onHistoryEntryRemoved: (entry: SearchHistoryEntry) => void;
    onClearHistory: () => void;
    hasSubmittedNoResults: boolean;
}

const TrackResults = ({ tracks }: { tracks: UnifiedTrackResult[] }) => (
    <View style={styles.trackList}>
        {tracks.map((track) => (
            <View key={track.id} style={styles.trackRow}>
                <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                <Text style={styles.trackArtist} numberOfLines={1}>
                    {(track['artist-credit'] ?? []).map(credit => `${credit.name}${credit.joinphrase ?? ''}`).join('')}
                </Text>
            </View>
        ))}
    </View>
);

const SearchView = ({
    query, scope, history, artists, artistCount, artistProfileImages, pendingArtistImageIds,
    isArtistsLoading, canLoadMoreArtists, releaseGroups, releaseGroupCount, releaseGroupCovers,
    pendingReleaseGroupCoverIds, isReleasesLoading, canLoadMoreReleaseGroups, tracks, trackCount,
    isTracksLoading, onQueryChanged, onScopeChanged, onSubmitSearch, onLoadMoreArtists,
    onLoadMoreReleaseGroups, onArtistPressed, onReleaseGroupPressed, onHistoryEntryPressed,
    onHistoryEntryRemoved, onClearHistory, hasSubmittedNoResults,
}: SearchViewProps) => {
    const showHistory = query.trim().length === 0;
    const hasScopedHistory = history.some((entry) => entry.scope === scope);
    const visibleScope = scope === 'all'
        ? (artists.length > 0 ? 'artists' : releaseGroups.length > 0 ? 'releases' : 'tracks')
        : scope;

    return (
        <ScreenContainer>
            <View style={styles.searchInputContainer}>
                <SearchInput query={query} scope={scope} onChangeText={onQueryChanged} onSubmitEditing={(q) => void onSubmitSearch(q)} />
            </View>
            <SearchTabs
                scope={scope}
                counts={{ all: artistCount + releaseGroupCount + trackCount, artists: artistCount, releases: releaseGroupCount, tracks: trackCount }}
                onScopeChange={onScopeChanged}
            />
            {showHistory ? (
                <View style={styles.emptyQueryArea}>
                    {hasScopedHistory ? <SearchHistoryList entries={history} scope={scope} onEntryPress={onHistoryEntryPressed} onEntryRemove={onHistoryEntryRemoved} onClear={onClearHistory} fill={!hasScopedHistory} /> : null}
                    <SearchEmptyState scope={scope} compact={hasScopedHistory} noResults={hasSubmittedNoResults} />
                </View>
            ) : hasSubmittedNoResults ? (
                <SearchEmptyState scope={scope} noResults />
            ) : visibleScope === 'artists' ? (
                <SearchResults artists={artists} artistProfileImages={artistProfileImages} pendingArtistImageIds={pendingArtistImageIds} isLoading={isArtistsLoading} canLoadMore={canLoadMoreArtists} onLoadMore={() => void onLoadMoreArtists()} onArtistPress={onArtistPressed} />
            ) : visibleScope === 'releases' ? (
                <ReleaseGroupSearchResults releaseGroups={releaseGroups} releaseGroupCovers={releaseGroupCovers} pendingCoverIds={pendingReleaseGroupCoverIds} isLoading={isReleasesLoading} canLoadMore={canLoadMoreReleaseGroups} onLoadMore={() => void onLoadMoreReleaseGroups()} onReleaseGroupPress={onReleaseGroupPressed} />
            ) : (
                <TrackResults tracks={tracks} />
            )}
        </ScreenContainer>
    );
};

const styles = StyleSheet.create({
    emptyQueryArea: { flex: 1 },
    searchInputContainer: { marginHorizontal: -10, marginBottom: 10 },
    trackList: { flex: 1 },
    trackRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
    trackTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
    trackArtist: { color: '#94a3b8', fontSize: 13, marginTop: 3 },
});

export default SearchView;

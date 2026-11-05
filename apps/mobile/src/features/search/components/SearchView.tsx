import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { InlineLink, ScreenContainer, Spinner } from '../../../components/ui';
import { CachedImageComponent } from '../../../components/cachedImage/CachedImageComponent';
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
import { theme } from '../../../styles/theme';
import ScrollButtons, { useScrollAffordance } from '../../../components/ScrollAffordance';

interface SearchViewProps {
    query: string;
    scope: SearchScope;
    /** True once a query has actually been submitted (results or a pending search). */
    hasSubmittedSearch: boolean;
    history: SearchHistoryEntry[];
    artists: Artist[];
    artistCount: number;
    releaseGroupCount: number;
    trackCount: number;
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isArtistsLoading: boolean;
    canLoadMoreArtists: boolean;
    releaseGroups: ReleaseGroupSearchResultItem[];
    releaseGroupCovers: Record<string, string | null | undefined>;
    pendingReleaseGroupCoverIds: string[];
    isReleasesLoading: boolean;
    canLoadMoreReleaseGroups: boolean;
    tracks: UnifiedTrackResult[];
    trackCovers: Record<string, string | null | undefined>;
    pendingTrackCoverIds: string[];
    isTracksLoading: boolean;
    onQueryChanged: (query: string) => void;
    onScopeChanged: (scope: SearchScope) => void;
    onSubmitSearch: (query?: string) => Promise<void>;
    onLoadMoreArtists: () => Promise<void>;
    onLoadMoreReleaseGroups: () => Promise<void>;
    onLoadMoreTracks: () => Promise<void>;
    onArtistPressed: (artistId: string) => void;
    onReleaseGroupPressed: (releaseGroupId: string) => void;
    onTrackPressed: (releaseId: string) => void;
    onHistoryEntryPressed: (entry: SearchHistoryEntry) => void;
    onHistoryEntryRemoved: (entry: SearchHistoryEntry) => void;
    onClearHistory: () => void;
    hasSubmittedNoResults: boolean;
}

const TrackResults = ({
    tracks,
    trackCovers,
    pendingCoverIds,
    isLoading,
    canLoadMore,
    onLoadMore,
    onTrackPress,
}: {
    tracks: UnifiedTrackResult[];
    trackCovers: Record<string, string | null | undefined>;
    pendingCoverIds: string[];
    isLoading: boolean;
    canLoadMore: boolean;
    onLoadMore: () => void;
    onTrackPress: (releaseId: string) => void;
}) => {
    const pending = React.useMemo(() => new Set(pendingCoverIds), [pendingCoverIds]);
    const listRef = React.useRef<FlatList<UnifiedTrackResult> | null>(null);
    const scroll = useScrollAffordance();

    const renderItem = ({ item: track }: { item: UnifiedTrackResult }) => {
        const release = track.release;
        const isCoverPending = !!release && pending.has(release.id);
        const artistNames = (track['artist-credit'] ?? [])
            .map((credit) => `${credit.name}${credit.joinphrase ?? ''}`)
            .join('')
            .trim();
        const metaLine = [artistNames, release?.title, release?.date?.slice(0, 4)]
            .filter(Boolean)
            .join(' · ');

        return (
            <Pressable
                onPress={() => (release ? onTrackPress(release.id) : undefined)}
                disabled={!release}
                accessibilityRole="button"
                accessibilityLabel={`Open release ${release?.title ?? track.title}`}
                style={({ pressed }) => [styles.trackRow, pressed && styles.trackRowPressed]}
            >
                <CachedImageComponent
                    imageUrl={isCoverPending ? undefined : trackCovers[release?.id ?? '']}
                    type="release"
                    showSpinnerWhenNoImage={isCoverPending}
                    style={styles.trackCover}
                />
                <View style={styles.trackTextColumn}>
                    <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">
                        {track.title}
                    </Text>
                    {metaLine.length > 0 && (
                        <Text style={styles.trackArtist} numberOfLines={1} ellipsizeMode="tail">
                            {metaLine}
                        </Text>
                    )}
                </View>
            </Pressable>
        );
    };

    return (
        <View style={styles.trackList}>
            <FlatList
                ref={listRef}
                data={tracks}
                keyExtractor={(track) => track.id}
                onScroll={scroll.onScroll}
                scrollEventThrottle={scroll.scrollEventThrottle}
                renderItem={renderItem}
                style={styles.trackListViewport}
                contentContainerStyle={styles.trackListContent}
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={11}
                ListEmptyComponent={
                    isLoading ? (
                        // ActivityIndicator, not Spinner: the shared overlay paints a
                        // translucent box that read as a broken grey panel here.
                        <View style={styles.trackLoading}>
                            <ActivityIndicator size="large" color={theme.colors.text} />
                        </View>
                    ) : null
                }
                ListFooterComponent={
                    canLoadMore || (isLoading && tracks.length > 0) ? (
                        <InlineLink onPress={onLoadMore} isLoading={isLoading}>
                            Load more
                        </InlineLink>
                    ) : null
                }
            />
            <ScrollButtons
                showScrollToTop={scroll.showScrollToTop}
                showScrollToBottom={scroll.showScrollToBottom}
                onScrollToTop={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
                onScrollToBottom={() =>
                    listRef.current?.scrollToEnd({ animated: true })
                }
                bottomOffset={20}
            />
        </View>
    );
};

const SearchView = ({
    query,
    scope,
    hasSubmittedSearch,
    history,
    artists,
    artistCount,
    releaseGroupCount,
    trackCount,
    artistProfileImages,
    pendingArtistImageIds,
    isArtistsLoading,
    canLoadMoreArtists,
    releaseGroups,
    releaseGroupCovers,
    pendingReleaseGroupCoverIds,
    isReleasesLoading,
    canLoadMoreReleaseGroups,
    tracks,
    trackCovers,
    pendingTrackCoverIds,
    isTracksLoading,
    onQueryChanged,
    onScopeChanged,
    onSubmitSearch,
    onLoadMoreArtists,
    onLoadMoreReleaseGroups,
    onLoadMoreTracks,
    onArtistPressed,
    onReleaseGroupPressed,
    onTrackPressed,
    onHistoryEntryPressed,
    onHistoryEntryRemoved,
    onClearHistory,
    hasSubmittedNoResults,
}: SearchViewProps) => {
    const isAnyLoading = isArtistsLoading || isReleasesLoading || isTracksLoading;
    // "Load more" also sets isLoading, so the tab row must key off *whether there are
    // results yet*, not off loading in general — otherwise paging hides the filters.
    const hasResults =
        artists.length > 0 || releaseGroups.length > 0 || tracks.length > 0;
    const isInitialLoading = isAnyLoading && !hasResults;
    const showHistory = query.trim().length === 0;
    const hasScopedHistory = history.some((entry) => entry.scope === scope);
    // Tabs describe a finished result set: showing them mid-search implies counts
    // that are still zero.
    const showTabs = !showHistory && hasSubmittedSearch && !isInitialLoading;

    return (
        <ScreenContainer>
            <View style={styles.searchInputContainer}>
                <SearchInput
                    query={query}
                    scope={scope}
                    onChangeText={onQueryChanged}
                    onSubmitEditing={(submittedQuery) => void onSubmitSearch(submittedQuery)}
                />
            </View>
            {showTabs && (
                <SearchTabs
                    scope={scope}
                    counts={{
                        artists: artistCount,
                        releases: releaseGroupCount,
                        tracks: trackCount,
                    }}
                    onScopeChange={onScopeChanged}
                />
            )}
            {showHistory ? (
                <View style={styles.emptyQueryArea}>
                    {hasScopedHistory ? (
                        <SearchHistoryList
                            entries={history}
                            scope={scope}
                            onEntryPress={onHistoryEntryPressed}
                            onEntryRemove={onHistoryEntryRemoved}
                            onClear={onClearHistory}
                            fill={!hasScopedHistory}
                        />
                    ) : null}
                    <SearchEmptyState scope={scope} compact={hasScopedHistory} noResults={false} />
                </View>
            ) : hasSubmittedNoResults ? (
                <SearchEmptyState scope={scope} noResults />
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
            ) : scope === 'releases' ? (
                <ReleaseGroupSearchResults
                    releaseGroups={releaseGroups}
                    releaseGroupCovers={releaseGroupCovers}
                    pendingCoverIds={pendingReleaseGroupCoverIds}
                    isLoading={isReleasesLoading}
                    canLoadMore={canLoadMoreReleaseGroups}
                    onLoadMore={() => void onLoadMoreReleaseGroups()}
                    onReleaseGroupPress={onReleaseGroupPressed}
                />
            ) : (
                <TrackResults
                    tracks={tracks}
                    trackCovers={trackCovers}
                    pendingCoverIds={pendingTrackCoverIds}
                    isLoading={isTracksLoading}
                    canLoadMore={!hasSubmittedNoResults && tracks.length > 0}
                    onLoadMore={() => void onLoadMoreTracks()}
                    onTrackPress={onTrackPressed}
                />
            )}
        </ScreenContainer>
    );
};

const styles = StyleSheet.create({
    emptyQueryArea: { flex: 1 },
    searchInputContainer: { marginHorizontal: -10, marginBottom: 10 },
    trackList: { flex: 1 },
    trackListViewport: { flex: 1 },
    trackListContent: { paddingBottom: 14 },
    trackLoading: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    },
    trackRowPressed: { opacity: 0.7 },
    trackCover: { width: 56, height: 56, borderRadius: 6 },
    trackTextColumn: { flex: 1 },
    trackTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
    trackArtist: { color: theme.colors.textMuted, fontSize: 13, marginTop: 3 },
});

export default SearchView;

import { mergeNullableStringMaps, normalizeNullableStringMap } from '../../../utils/nullableMaps';
import type { UnifiedSearchResponse } from '../../../types/apiTypes';
import {
    createInitialUnifiedSearchState,
    type SearchFilter,
    type UnifiedSearchState,
} from '../model/unifiedTypes';

/** Rows the server returns per category per request. */
export const SERVER_PAGE_SIZE = 100;

/** Rows revealed per "Load more" tap, from the already-fetched buffer. */
export const LOCAL_PAGE_SIZE = 10;

export type SearchKind = 'initial' | 'artists' | 'releaseGroups' | 'tracks';
export type SearchCategoryKind = 'artists' | 'releaseGroups' | 'tracks';

const appendUnique = <T extends { id: string }>(old: T[], next: T[]): T[] => {
    const seen = new Set(old.map((item) => item.id));
    return [...old, ...next.filter((item) => !seen.has(item.id))];
};

const kindToFilter = (kind: SearchCategoryKind): SearchFilter =>
    kind === 'artists' ? 'artists' : kind === 'releaseGroups' ? 'releases' : 'tracks';

const pickInitialLoadedScope = (result: UnifiedSearchResponse): SearchFilter | null => {
    if (result.artists.length > 0) return 'artists';
    if (result.releaseGroups.length > 0) return 'releases';
    if (result.recordings.length > 0) return 'tracks';
    return null;
};

export type UnifiedSearchAction =
    | { type: 'queryChanged'; query: string }
    | { type: 'started'; query: string; kind: SearchKind; offset: number }
    | { type: 'succeeded'; result: UnifiedSearchResponse; kind: SearchKind; offset: number }
    | { type: 'trackCoversResolved'; covers: Record<string, string | null | undefined> }
    | { type: 'revealed'; kind: SearchCategoryKind; count: number }
    | { type: 'failed'; kind?: SearchKind };

export const unifiedSearchReducer = (
    state: UnifiedSearchState,
    action: UnifiedSearchAction,
): UnifiedSearchState => {
    switch (action.type) {
        case 'queryChanged':
            // Typing a different query invalidates the rendered results *and* the
            // tabs: they only make sense once something has been searched.
            return action.query.trim() === state.submittedQuery
                ? { ...state, query: action.query }
                : { ...createInitialUnifiedSearchState(), query: action.query };
        case 'started': {
            if (action.kind === 'initial') {
                return {
                    ...createInitialUnifiedSearchState(),
                    query: action.query,
                    submittedQuery: action.query,
                    hasSubmittedSearch: true,
                    isLoading: true,
                    isLoadingArtists: true,
                    isLoadingReleaseGroups: true,
                    isLoadingTracks: true,
                };
            }

            const isFreshQuery = action.offset === 0 && action.query !== state.submittedQuery;
            const base = isFreshQuery
                ? {
                      ...createInitialUnifiedSearchState(),
                      query: action.query,
                      submittedQuery: action.query,
                      hasSubmittedSearch: true,
                  }
                : {
                      ...state,
                      query: action.query,
                      submittedQuery: action.query,
                      hasSubmittedSearch: true,
                  };

            const isLoadingArtists =
                action.kind === 'artists' ? true : base.isLoadingArtists;
            const isLoadingReleaseGroups =
                action.kind === 'releaseGroups' ? true : base.isLoadingReleaseGroups;
            const isLoadingTracks =
                action.kind === 'tracks' ? true : base.isLoadingTracks;

            return {
                ...base,
                isLoadingArtists,
                isLoadingReleaseGroups,
                isLoadingTracks,
                isLoading: isLoadingArtists || isLoadingReleaseGroups || isLoadingTracks,
            };
        }
        case 'succeeded': {
            const { result, kind, offset } = action;
            const artists =
                kind === 'initial' || kind === 'artists'
                    ? offset
                        ? appendUnique(state.artists, result.artists)
                        : result.artists
                    : state.artists;
            const releaseGroups =
                kind === 'initial' || kind === 'releaseGroups'
                    ? offset
                        ? appendUnique(state.releaseGroups, result.releaseGroups)
                        : result.releaseGroups
                    : state.releaseGroups;
            const tracks =
                kind === 'initial' || kind === 'tracks'
                    ? offset
                        ? appendUnique(state.tracks, result.recordings)
                        : result.recordings
                    : state.tracks;

            const isLoadingArtists =
                kind === 'initial' || kind === 'artists' ? false : state.isLoadingArtists;
            const isLoadingReleaseGroups =
                kind === 'initial' || kind === 'releaseGroups'
                    ? false
                    : state.isLoadingReleaseGroups;
            const isLoadingTracks =
                kind === 'initial' || kind === 'tracks' ? false : state.isLoadingTracks;
            const isLoading =
                isLoadingArtists || isLoadingReleaseGroups || isLoadingTracks;

            let firstLoadedScope = state.firstLoadedScope;
            if (firstLoadedScope === null && offset === 0) {
                if (kind === 'initial') {
                    firstLoadedScope = pickInitialLoadedScope(result);
                } else {
                    const arrivedHasRows =
                        kind === 'artists'
                            ? result.artists.length > 0
                            : kind === 'releaseGroups'
                              ? result.releaseGroups.length > 0
                              : result.recordings.length > 0;
                    if (arrivedHasRows) {
                        firstLoadedScope = kindToFilter(kind);
                    }
                }
            }

            return {
                ...state,
                artists,
                releaseGroups,
                tracks,
                artistCount:
                    kind === 'initial' || kind === 'artists'
                        ? result.artistCount
                        : state.artistCount,
                releaseGroupCount:
                    kind === 'initial' || kind === 'releaseGroups'
                        ? result.releaseGroupCount
                        : state.releaseGroupCount,
                trackCount:
                    kind === 'initial' || kind === 'tracks'
                        ? result.recordingCount
                        : state.trackCount,
                artistProfileImages:
                    kind === 'initial' || kind === 'artists'
                        ? mergeNullableStringMaps(
                              state.artistProfileImages,
                              normalizeNullableStringMap(result.artistProfileImages),
                          )
                        : state.artistProfileImages,
                releaseGroupCovers:
                    kind === 'initial' || kind === 'releaseGroups'
                        ? mergeNullableStringMaps(
                              state.releaseGroupCovers,
                              normalizeNullableStringMap(result.releaseGroupCovers),
                          )
                        : state.releaseGroupCovers,
                trackCovers:
                    kind === 'initial' || kind === 'tracks'
                        ? mergeNullableStringMaps(
                              state.trackCovers,
                              normalizeNullableStringMap(result.releaseCovers),
                          )
                        : state.trackCovers,
                pendingArtistImageIds:
                    (kind === 'initial' || kind === 'artists') && result.artistProfileImageTaskId
                        ? result.artists
                              .map((artist) => artist.id)
                              .filter((id) => !result.artistProfileImages?.[id])
                        : kind === 'artists'
                          ? []
                          : state.pendingArtistImageIds,
                pendingReleaseGroupCoverIds:
                    (kind === 'initial' || kind === 'releaseGroups') &&
                    result.releaseGroupCoverTaskId
                        ? result.releaseGroups
                              .map((group) => group.id)
                              .filter((id) => !result.releaseGroupCovers?.[id])
                        : kind === 'releaseGroups'
                          ? []
                          : state.pendingReleaseGroupCoverIds,
                pendingTrackCoverIds:
                    (kind === 'initial' || kind === 'tracks') && result.releaseCoverTaskId
                        ? result.recordings
                              .flatMap((recording) =>
                                  recording.release ? [recording.release.id] : [],
                              )
                              .filter((id) => !result.releaseCovers?.[id])
                        : kind === 'tracks'
                          ? []
                          : state.pendingTrackCoverIds,
                isLoading,
                firstLoadedScope,
                artistVisible:
                    kind === 'initial' || (kind === 'artists' && offset === 0)
                        ? Math.min(artists.length, LOCAL_PAGE_SIZE)
                        : kind === 'artists'
                          ? Math.min(state.artistVisible + LOCAL_PAGE_SIZE, artists.length)
                          : state.artistVisible,
                releaseGroupVisible:
                    kind === 'initial' || (kind === 'releaseGroups' && offset === 0)
                        ? Math.min(releaseGroups.length, LOCAL_PAGE_SIZE)
                        : kind === 'releaseGroups'
                          ? Math.min(
                                state.releaseGroupVisible + LOCAL_PAGE_SIZE,
                                releaseGroups.length,
                            )
                          : state.releaseGroupVisible,
                trackVisible:
                    kind === 'initial' || (kind === 'tracks' && offset === 0)
                        ? Math.min(tracks.length, LOCAL_PAGE_SIZE)
                        : kind === 'tracks'
                          ? Math.min(state.trackVisible + LOCAL_PAGE_SIZE, tracks.length)
                          : state.trackVisible,
                isLoadingArtists,
                isLoadingReleaseGroups,
                isLoadingTracks,
                artistOffset:
                    kind === 'initial' || kind === 'artists'
                        ? offset + result.artists.length
                        : state.artistOffset,
                releaseGroupOffset:
                    kind === 'initial' || kind === 'releaseGroups'
                        ? offset + result.releaseGroups.length
                        : state.releaseGroupOffset,
                trackOffset:
                    kind === 'initial' || kind === 'tracks'
                        ? offset + result.recordings.length
                        : state.trackOffset,
                artistsAllFetched:
                    kind === 'initial' || kind === 'artists'
                        ? result.artists.length < SERVER_PAGE_SIZE ||
                          artists.length >= result.artistCount
                        : state.artistsAllFetched,
                releaseGroupsAllFetched:
                    kind === 'initial' || kind === 'releaseGroups'
                        ? result.releaseGroups.length < SERVER_PAGE_SIZE ||
                          releaseGroups.length >= result.releaseGroupCount
                        : state.releaseGroupsAllFetched,
                tracksAllFetched:
                    kind === 'initial' || kind === 'tracks'
                        ? result.recordings.length < SERVER_PAGE_SIZE ||
                          tracks.length >= result.recordingCount
                        : state.tracksAllFetched,
            };
        }
        case 'revealed':
            return action.kind === 'artists'
                ? {
                      ...state,
                      artistVisible: Math.min(
                          state.artistVisible + action.count,
                          state.artists.length,
                      ),
                  }
                : action.kind === 'releaseGroups'
                  ? {
                        ...state,
                        releaseGroupVisible: Math.min(
                            state.releaseGroupVisible + action.count,
                            state.releaseGroups.length,
                        ),
                    }
                  : {
                        ...state,
                        trackVisible: Math.min(
                            state.trackVisible + action.count,
                            state.tracks.length,
                        ),
                    };
        case 'trackCoversResolved':
            return {
                ...state,
                trackCovers: mergeNullableStringMaps(state.trackCovers, action.covers),
                pendingTrackCoverIds: [],
            };
        case 'failed': {
            const kind = action.kind ?? 'initial';
            const isLoadingArtists =
                kind === 'initial' || kind === 'artists' ? false : state.isLoadingArtists;
            const isLoadingReleaseGroups =
                kind === 'initial' || kind === 'releaseGroups'
                    ? false
                    : state.isLoadingReleaseGroups;
            const isLoadingTracks =
                kind === 'initial' || kind === 'tracks' ? false : state.isLoadingTracks;
            return {
                ...state,
                isLoadingArtists,
                isLoadingReleaseGroups,
                isLoadingTracks,
                isLoading: isLoadingArtists || isLoadingReleaseGroups || isLoadingTracks,
            };
        }
    }
};

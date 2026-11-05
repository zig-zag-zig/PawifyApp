import { useNavigation } from '@react-navigation/native';
import { useCallback, useReducer, useRef } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import useTaskManager from '../../../hooks/useTaskManager';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import {
    extractArtistProfileImages,
    extractReleaseGroupCovers,
    extractReleaseGroupReleaseCovers,
} from '../../../utils/taskResultMaps';
import { mergeNullableStringMaps, normalizeNullableStringMap } from '../../../utils/nullableMaps';
import type { ArtistNavigationProp } from '../../../types/navigation';
import { useSearchApi } from '../api/searchApi';
import { addSearchHistoryEntry } from '../../../services/searchHistoryStorage';
import type { UnifiedSearchResponse } from '../../../types/apiTypes';
import { createInitialUnifiedSearchState, type UnifiedSearchState } from '../model/unifiedTypes';

const PAGE_SIZE = 10;

type SearchKind = 'initial' | 'artists' | 'releaseGroups' | 'tracks';
type Action =
    | { type: 'queryChanged'; query: string }
    | { type: 'started'; query: string; kind: SearchKind; offset: number }
    | { type: 'succeeded'; result: UnifiedSearchResponse; kind: SearchKind; offset: number }
    | { type: 'trackCoversResolved'; covers: Record<string, string | null | undefined> }
    | { type: 'failed' };

const appendUnique = <T extends { id: string }>(old: T[], next: T[]): T[] => {
    const seen = new Set(old.map((item) => item.id));
    return [...old, ...next.filter((item) => !seen.has(item.id))];
};

const resolver = (state: UnifiedSearchState, action: Action): UnifiedSearchState => {
    switch (action.type) {
        case 'queryChanged':
            // Typing a different query invalidates the rendered results *and* the
            // tabs: they only make sense once something has been searched.
            return action.query.trim() === state.submittedQuery
                ? { ...state, query: action.query }
                : { ...createInitialUnifiedSearchState(), query: action.query };
        case 'started':
            return {
                ...state,
                query: action.query,
                submittedQuery: action.query,
                hasSubmittedSearch: true,
                isLoading: true,
                isLoadingArtists: action.kind === 'initial' || action.kind === 'artists',
                isLoadingReleaseGroups: action.kind === 'initial' || action.kind === 'releaseGroups',
                isLoadingTracks: action.kind === 'initial' || action.kind === 'tracks',
            };
        case 'succeeded': {
            const { result, kind, offset } = action;
            const artists = kind === 'initial' ? (offset ? appendUnique(state.artists, result.artists) : result.artists)
                : kind === 'artists' ? (offset ? appendUnique(state.artists, result.artists) : result.artists) : state.artists;
            const releaseGroups = kind === 'initial' ? (offset ? appendUnique(state.releaseGroups, result.releaseGroups) : result.releaseGroups)
                : kind === 'releaseGroups' ? (offset ? appendUnique(state.releaseGroups, result.releaseGroups) : result.releaseGroups) : state.releaseGroups;
            const tracks = kind === 'initial' ? (offset ? appendUnique(state.tracks, result.recordings) : result.recordings)
                : kind === 'tracks' ? (offset ? appendUnique(state.tracks, result.recordings) : result.recordings) : state.tracks;
            const rows = kind === 'artists' ? result.artists : kind === 'releaseGroups' ? result.releaseGroups : result.recordings;
            const nextOffset = offset + rows.length;
            const count = kind === 'artists' ? result.artistCount : kind === 'releaseGroups' ? result.releaseGroupCount : result.recordingCount;

            return {
                ...state,
                artists,
                releaseGroups,
                tracks,
                artistCount: kind === 'initial' || kind === 'artists' ? result.artistCount : state.artistCount,
                releaseGroupCount: kind === 'initial' || kind === 'releaseGroups' ? result.releaseGroupCount : state.releaseGroupCount,
                trackCount: kind === 'initial' || kind === 'tracks' ? result.recordingCount : state.trackCount,
                artistProfileImages: (kind === 'initial' || kind === 'artists')
                    ? mergeNullableStringMaps(state.artistProfileImages, normalizeNullableStringMap(result.artistProfileImages))
                    : state.artistProfileImages,
                releaseGroupCovers: (kind === 'initial' || kind === 'releaseGroups')
                    ? mergeNullableStringMaps(state.releaseGroupCovers, normalizeNullableStringMap(result.releaseGroupCovers))
                    : state.releaseGroupCovers,
                trackCovers: (kind === 'initial' || kind === 'tracks')
                    ? mergeNullableStringMaps(state.trackCovers, normalizeNullableStringMap(result.releaseCovers))
                    : state.trackCovers,
                pendingArtistImageIds: (kind === 'initial' || kind === 'artists') && result.artistProfileImageTaskId
                    ? result.artists.map((artist) => artist.id).filter((id) => !result.artistProfileImages?.[id])
                    : kind === 'artists' ? [] : state.pendingArtistImageIds,
                pendingReleaseGroupCoverIds: (kind === 'initial' || kind === 'releaseGroups') && result.releaseGroupCoverTaskId
                    ? result.releaseGroups.map((group) => group.id).filter((id) => !result.releaseGroupCovers?.[id])
                    : kind === 'releaseGroups' ? [] : state.pendingReleaseGroupCoverIds,
                pendingTrackCoverIds: (kind === 'initial' || kind === 'tracks') && result.releaseCoverTaskId
                    ? result.recordings.flatMap((recording) => recording.release ? [recording.release.id] : []).filter((id) => !result.releaseCovers?.[id])
                    : kind === 'tracks' ? [] : state.pendingTrackCoverIds,
                isLoading: false,
                isLoadingArtists: kind === 'initial' || kind === 'artists' ? false : state.isLoadingArtists,
                isLoadingReleaseGroups: kind === 'initial' || kind === 'releaseGroups' ? false : state.isLoadingReleaseGroups,
                isLoadingTracks: kind === 'initial' || kind === 'tracks' ? false : state.isLoadingTracks,
                artistOffset: kind === 'initial' || kind === 'artists' ? result.artists.length : state.artistOffset,
                releaseGroupOffset: kind === 'initial' || kind === 'releaseGroups' ? result.releaseGroups.length : state.releaseGroupOffset,
                trackOffset: kind === 'initial' || kind === 'tracks' ? result.recordings.length : state.trackOffset,
                artistsAllFetched: kind === 'initial' || kind === 'artists' ? result.artists.length < PAGE_SIZE || result.artists.length >= result.artistCount : state.artistsAllFetched,
                releaseGroupsAllFetched: kind === 'initial' || kind === 'releaseGroups' ? result.releaseGroups.length < PAGE_SIZE || result.releaseGroups.length >= result.releaseGroupCount : state.releaseGroupsAllFetched,
                tracksAllFetched: kind === 'initial' || kind === 'tracks' ? result.recordings.length < PAGE_SIZE || result.recordings.length >= result.recordingCount : state.tracksAllFetched,
            };
        }
        case 'trackCoversResolved':
            return {
                ...state,
                trackCovers: mergeNullableStringMaps(state.trackCovers, action.covers),
                pendingTrackCoverIds: [],
            };
        case 'failed':
            return { ...state, isLoading: false };
    }
};

export type UnifiedSearchController = {
    state: UnifiedSearchState;
    onQueryChanged: (query: string) => void;
    onSubmitSearch: (query?: string) => Promise<void>;
    onLoadMoreArtists: () => Promise<void>;
    onLoadMoreReleaseGroups: () => Promise<void>;
    onLoadMoreTracks: () => Promise<void>;
    onArtistPressed: (id: string) => void;
    onReleaseGroupPressed: (id: string) => void;
    onTrackPressed: (releaseId: string) => void;
};

export const useUnifiedSearch = (): UnifiedSearchController => {
    const navigation = useNavigation<ArtistNavigationProp>();
    const { searchAll, waitForTaskResultById } = useSearchApi();
    const {
        artistProfileImages,
        setArtistProfileImages,
        releaseGroupCovers,
        setReleaseGroupCovers,
    } = useCache();
    const { addTask, executeTask } = useTaskManager();
    const [state, dispatch] = useReducer(resolver, undefined, createInitialUnifiedSearchState);
    const inFlight = useRef(false);

    const resolveTasks = useCallback(
        async (result: UnifiedSearchResponse) => {
            if (result.artistProfileImageTaskId) {
                void resolveNullableTaskMap({
                    taskId: result.artistProfileImageTaskId,
                    expectedIds: result.artists.map((artist) => artist.id),
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractArtistProfileImages,
                    onResolvedValues: (values) =>
                        setArtistProfileImages((previous) => ({ ...previous, ...values })),
                    onError: (error) =>
                        console.warn('unified-search: artist images failed', error),
                });
            }

            if (result.releaseGroupCoverTaskId) {
                void resolveNullableTaskMap({
                    taskId: result.releaseGroupCoverTaskId,
                    expectedIds: result.releaseGroups.map((group) => group.id),
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractReleaseGroupCovers,
                    onResolvedValues: (values) =>
                        setReleaseGroupCovers((previous) => ({ ...previous, ...values })),
                    onError: (error) =>
                        console.warn('unified-search: release covers failed', error),
                });
            }

            if (result.releaseCoverTaskId) {
                void resolveNullableTaskMap({
                    taskId: result.releaseCoverTaskId,
                    expectedIds: result.recordings.flatMap((recording) =>
                        recording.release ? [recording.release.id] : [],
                    ),
                    waitForTaskResult: waitForTaskResultById,
                    extractMap: extractReleaseGroupReleaseCovers,
                    onResolvedValues: (values) =>
                        dispatch({ type: 'trackCoversResolved', covers: values }),
                    onError: (error) =>
                        console.warn('unified-search: track covers failed', error),
                });
            }
        },
        [setArtistProfileImages, setReleaseGroupCovers, waitForTaskResultById],
    );

    const run = useCallback(
        async (raw: string, kind: SearchKind, append: boolean) => {
            const query = raw.trim();
            if (query.length < 2 || inFlight.current) {
                return;
            }

            const offset = kind === 'artists' ? state.artistOffset
                : kind === 'releaseGroups' ? state.releaseGroupOffset : state.trackOffset;
            inFlight.current = true;
            dispatch({ type: 'started', query, kind, offset: append ? offset : 0 });

            try {
                const task = addTask(() => searchAll(query, PAGE_SIZE, append ? offset : 0, kind === 'initial' ? undefined : kind), 'searchAll', {
                    replayPolicy: 'both',
                });
                const result = await executeTask(task);
                if (!result) {
                    throw new Error('Search did not complete');
                }

                dispatch({ type: 'succeeded', result, kind, offset: append ? offset : 0 });
                void resolveTasks(result);
                if (!append) {
                    void addSearchHistoryEntry(query, 'artists');
                }
            } catch (error) {
                console.warn('unified-search failed', error);
                dispatch({ type: 'failed' });
            } finally {
                inFlight.current = false;
            }
        },
        [addTask, executeTask, resolveTasks, searchAll, state.artistOffset, state.releaseGroupOffset, state.trackOffset],
    );

    // Merge in the app-wide caches (background tasks write there) and recompute what is
    // *still* pending from that merged view. Keeping the response's pending list as-is
    // would hold the placeholder long after the image had arrived.
    const mergedArtistImages = { ...artistProfileImages, ...state.artistProfileImages };
    const mergedGroupCovers = { ...releaseGroupCovers, ...state.releaseGroupCovers };

    const stillPending = (ids: string[], values: Record<string, string | null | undefined>) =>
        ids.filter((id) => values[id] === undefined);

    return {
        state: {
            ...state,
            artistProfileImages: mergedArtistImages,
            releaseGroupCovers: mergedGroupCovers,
            pendingArtistImageIds: stillPending(state.pendingArtistImageIds, mergedArtistImages),
            pendingReleaseGroupCoverIds: stillPending(
                state.pendingReleaseGroupCoverIds,
                mergedGroupCovers,
            ),
            pendingTrackCoverIds: stillPending(state.pendingTrackCoverIds, state.trackCovers),
        },
        onQueryChanged: (query) => dispatch({ type: 'queryChanged', query }),
        onSubmitSearch: async (query) => await run(query ?? state.query, 'initial', false),
        onLoadMoreArtists: async () => await run(state.submittedQuery, 'artists', true),
        onLoadMoreReleaseGroups: async () => await run(state.submittedQuery, 'releaseGroups', true),
        onLoadMoreTracks: async () => await run(state.submittedQuery, 'tracks', true),
        onArtistPressed: (id) => navigation.navigate('Artist', { artistId: id }),
        onReleaseGroupPressed: (id) => navigation.navigate('ReleaseGroup', { releaseGroupId: id }),
        onTrackPressed: (releaseId) => navigation.navigate('Release', { releaseId }),
    };
};

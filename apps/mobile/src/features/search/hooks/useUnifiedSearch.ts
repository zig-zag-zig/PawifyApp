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
import type { ArtistNavigationProp } from '../../../types/navigation';
import { useSearchApi } from '../api/searchApi';
import { addSearchHistoryEntry } from '../../../services/searchHistoryStorage';
import type { UnifiedSearchResponse } from '../../../types/apiTypes';
import { createInitialUnifiedSearchState, type UnifiedSearchState } from '../model/unifiedTypes';
import {
    LOCAL_PAGE_SIZE,
    SERVER_PAGE_SIZE,
    unifiedSearchReducer,
    type SearchCategoryKind,
} from '../state/unifiedSearchReducer';

const INITIAL_CATEGORY_ORDER: readonly SearchCategoryKind[] = [
    'artists',
    'releaseGroups',
    'tracks',
];

export type UnifiedSearchController = {
    state: UnifiedSearchState;
    searchSequence: number;
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
    const [state, dispatch] = useReducer(
        unifiedSearchReducer,
        undefined,
        createInitialUnifiedSearchState,
    );
    const inFlightByKind = useRef<Record<SearchCategoryKind, boolean>>({
        artists: false,
        releaseGroups: false,
        tracks: false,
    });
    const searchSeqRef = useRef(0);

    const resolveTasks = useCallback(
        async (result: UnifiedSearchResponse, kind: SearchCategoryKind) => {
            if (kind === 'artists' && result.artistProfileImageTaskId) {
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

            if (kind === 'releaseGroups' && result.releaseGroupCoverTaskId) {
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

            if (kind === 'tracks' && result.releaseCoverTaskId) {
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

    const runCategory = useCallback(
        async (
            query: string,
            kind: SearchCategoryKind,
            offset: number,
            expectedSeq: number,
        ): Promise<void> => {
            inFlightByKind.current[kind] = true;
            try {
                const task = addTask(
                    () => searchAll(query, SERVER_PAGE_SIZE, offset, kind),
                    `searchAll:${kind}`,
                    { replayPolicy: 'both' },
                );
                const result = await executeTask(task);
                if (!result) {
                    throw new Error(`Search did not complete (${kind})`);
                }
                if (searchSeqRef.current !== expectedSeq) {
                    return;
                }
                dispatch({ type: 'succeeded', result, kind, offset });
                void resolveTasks(result, kind);
            } catch (error) {
                console.warn(`unified-search failed (${kind})`, error);
                if (searchSeqRef.current === expectedSeq) {
                    dispatch({ type: 'failed', kind });
                }
            } finally {
                if (searchSeqRef.current === expectedSeq) {
                    inFlightByKind.current[kind] = false;
                }
            }
        },
        [addTask, executeTask, resolveTasks, searchAll],
    );

    const submitSearch = useCallback(
        async (raw: string): Promise<void> => {
            const query = raw.trim();
            if (query.length < 2) {
                return;
            }

            searchSeqRef.current += 1;
            const seq = searchSeqRef.current;
            inFlightByKind.current = {
                artists: true,
                releaseGroups: true,
                tracks: true,
            };
            dispatch({ type: 'started', query, kind: 'initial', offset: 0 });
            void addSearchHistoryEntry(query, 'artists');

            // Launch in tie-break priority order (artists -> releaseGroups -> tracks).
            // Each category dispatches independently as soon as its response arrives,
            // so fast local SQLite categories render immediately without waiting on
            // MusicBrainz track search.
            await Promise.all(
                INITIAL_CATEGORY_ORDER.map(
                    async (kind) => await runCategory(query, kind, 0, seq),
                ),
            );
        },
        [runCategory],
    );

    const loadMoreCategory = useCallback(
        async (kind: SearchCategoryKind): Promise<void> => {
            const query = state.submittedQuery.trim();
            if (query.length < 2 || inFlightByKind.current[kind]) {
                return;
            }

            const offset =
                kind === 'artists'
                    ? state.artistOffset
                    : kind === 'releaseGroups'
                      ? state.releaseGroupOffset
                      : state.trackOffset;
            const seq = searchSeqRef.current;
            dispatch({ type: 'started', query, kind, offset });
            await runCategory(query, kind, offset, seq);
        },
        [
            runCategory,
            state.artistOffset,
            state.releaseGroupOffset,
            state.submittedQuery,
            state.trackOffset,
        ],
    );

    // Merge in the app-wide caches (background tasks write there) and recompute what is
    // *still* pending from that merged view.
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
        searchSequence: searchSeqRef.current,
        onQueryChanged: (query) => {
            if (query.trim() !== state.submittedQuery) {
                searchSeqRef.current += 1;
                inFlightByKind.current = {
                    artists: false,
                    releaseGroups: false,
                    tracks: false,
                };
            }
            dispatch({ type: 'queryChanged', query });
        },
        onSubmitSearch: async (query) => await submitSearch(query ?? state.query),
        onLoadMoreArtists: async () => {
            if (state.artistVisible < state.artists.length) {
                dispatch({ type: 'revealed', kind: 'artists', count: LOCAL_PAGE_SIZE });
                return;
            }
            if (!state.artistsAllFetched) {
                await loadMoreCategory('artists');
            }
        },
        onLoadMoreReleaseGroups: async () => {
            if (state.releaseGroupVisible < state.releaseGroups.length) {
                dispatch({ type: 'revealed', kind: 'releaseGroups', count: LOCAL_PAGE_SIZE });
                return;
            }
            if (!state.releaseGroupsAllFetched) {
                await loadMoreCategory('releaseGroups');
            }
        },
        onLoadMoreTracks: async () => {
            if (state.trackVisible < state.tracks.length) {
                dispatch({ type: 'revealed', kind: 'tracks', count: LOCAL_PAGE_SIZE });
                return;
            }
            if (!state.tracksAllFetched) {
                await loadMoreCategory('tracks');
            }
        },
        onArtistPressed: (id) => navigation.navigate('Artist', { artistId: id }),
        onReleaseGroupPressed: (id) => navigation.navigate('ReleaseGroup', { releaseGroupId: id }),
        onTrackPressed: (releaseId) => navigation.navigate('Release', { releaseId }),
    };
};

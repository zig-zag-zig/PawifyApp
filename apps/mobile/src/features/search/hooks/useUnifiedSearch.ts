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

type Action =
    | { type: 'queryChanged'; query: string }
    | { type: 'started'; query: string; offset: number }
    | { type: 'succeeded'; result: UnifiedSearchResponse; offset: number }
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
                offset: action.offset,
            };
        case 'succeeded': {
            const { result, offset } = action;
            const artists = offset ? appendUnique(state.artists, result.artists) : result.artists;
            const releaseGroups = offset
                ? appendUnique(state.releaseGroups, result.releaseGroups)
                : result.releaseGroups;
            const tracks = offset ? appendUnique(state.tracks, result.recordings) : result.recordings;
            const fetched = Math.max(
                result.artists.length,
                result.releaseGroups.length,
                result.recordings.length,
            );
            const total = Math.max(
                result.artistCount,
                result.releaseGroupCount,
                result.recordingCount,
            );

            return {
                ...state,
                artists,
                releaseGroups,
                tracks,
                artistCount: result.artistCount,
                releaseGroupCount: result.releaseGroupCount,
                trackCount: result.recordingCount,
                artistProfileImages: mergeNullableStringMaps(
                    state.artistProfileImages,
                    normalizeNullableStringMap(result.artistProfileImages),
                ),
                releaseGroupCovers: mergeNullableStringMaps(
                    state.releaseGroupCovers,
                    normalizeNullableStringMap(result.releaseGroupCovers),
                ),
                trackCovers: mergeNullableStringMaps(
                    state.trackCovers,
                    normalizeNullableStringMap(result.releaseCovers),
                ),
                // Everything that still needs a picture is "pending" so the rows show
                // the loading placeholder instead of the app's generic no-image art.
                pendingArtistImageIds: result.artistProfileImageTaskId
                    ? result.artists
                          .map((artist) => artist.id)
                          .filter((id) => !result.artistProfileImages?.[id])
                    : [],
                pendingReleaseGroupCoverIds: result.releaseGroupCoverTaskId
                    ? result.releaseGroups
                          .map((group) => group.id)
                          .filter((id) => !result.releaseGroupCovers?.[id])
                    : [],
                pendingTrackCoverIds: result.releaseCoverTaskId
                    ? result.recordings
                          .flatMap((recording) =>
                              recording.release ? [recording.release.id] : [],
                          )
                          .filter((id) => !result.releaseCovers?.[id])
                    : [],
                isLoading: false,
                offset: offset + fetched,
                allResultsFetched: fetched < PAGE_SIZE || offset + fetched >= total,
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
    onLoadMore: () => Promise<void>;
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
        async (raw: string, append: boolean) => {
            const query = raw.trim();
            if (query.length < 2 || inFlight.current) {
                return;
            }

            inFlight.current = true;
            const offset = append ? state.offset : 0;
            dispatch({ type: 'started', query, offset });

            try {
                const task = addTask(() => searchAll(query, PAGE_SIZE, offset), 'searchAll', {
                    replayPolicy: 'both',
                });
                const result = await executeTask(task);
                if (!result) {
                    throw new Error('Search did not complete');
                }

                dispatch({ type: 'succeeded', result, offset });
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
        [addTask, executeTask, resolveTasks, searchAll, state.offset],
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
        onSubmitSearch: async (query) => await run(query ?? state.query, false),
        onLoadMore: async () => await run(state.submittedQuery, true),
        onArtistPressed: (id) => navigation.navigate('Artist', { artistId: id }),
        onReleaseGroupPressed: (id) => navigation.navigate('ReleaseGroup', { releaseGroupId: id }),
        onTrackPressed: (releaseId) => navigation.navigate('Release', { releaseId }),
    };
};

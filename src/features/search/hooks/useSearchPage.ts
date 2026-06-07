import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useCache } from '../../../contexts/CacheContext';
import useTaskManager from '../../../hooks/useTaskManager';
import type { Artist } from '../../../shared/music';
import { mergeNullableStringMaps } from '../../../utils/nullableMaps';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import { extractArtistProfileImages } from '../../../utils/taskResultMaps';
import { ArtistNavigationProp } from '../../../types/navigation';
import { useSearchApi } from '../api/searchApi';
import type { SearchPageController, SearchPageUiState } from '../model/types';
import {
    createInitialSearchState,
    SEARCH_PAGE_SIZE,
    searchReducer,
} from '../state/searchReducer';

type SearchProfileImageTask = {
    taskId: string;
    query: string;
    offset: number;
    artistIds: string[];
};

type SearchTaskResult = {
    artists: Artist[];
    nextOffset: number;
    allResultsFetched: boolean;
    isAppending: boolean;
    profileImageTasks: SearchProfileImageTask[];
};

type SearchPageResult = {
    artists: Artist[];
    count: number;
    profileImageTaskId?: string;
};

const hasOwn = <T extends object>(value: T, property: PropertyKey): boolean => (
    Object.prototype.hasOwnProperty.call(value, property)
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isArtist = (value: unknown): value is Artist => (
    isRecord(value)
    && typeof value.id === 'string'
    && value.id.length > 0
    && typeof value.name === 'string'
    && value.name.length > 0
);

const normalizeSearchPageResult = (value: unknown): SearchPageResult => {
    if (!isRecord(value) || !Array.isArray(value.artists)) {
        throw new Error('Invalid artist search response');
    }

    const artists = value.artists.filter(isArtist);
    const count = typeof value.count === 'number' && Number.isFinite(value.count)
        ? Math.max(0, value.count)
        : artists.length;
    const profileImageTaskId = typeof value.profileImageTaskId === 'string' && value.profileImageTaskId.length > 0
        ? value.profileImageTaskId
        : undefined;

    return {
        artists,
        count,
        profileImageTaskId,
    };
};

const appendUniqueArtists = (
    target: Artist[],
    artists: Artist[],
    seenArtistIds: Set<string>,
): Artist[] => {
    const addedArtists: Artist[] = [];

    for (const artist of artists) {
        if (seenArtistIds.has(artist.id)) {
            continue;
        }

        seenArtistIds.add(artist.id);
        target.push(artist);
        addedArtists.push(artist);
    }

    return addedArtists;
};

const getPageCount = (result: SearchPageResult): number => (
    Number.isFinite(result.count) ? result.count : result.artists.length
);

export function useSearchPage(): SearchPageController {
    const navigation = useNavigation<ArtistNavigationProp>();
    const { searchArtists, waitForTaskResult } = useSearchApi();
    const { artistProfileImages, setArtistProfileImages } = useCache();
    const { tasks, addTask, removeTask, executeTask } = useTaskManager();
    const [pendingArtistImageIds, setPendingArtistImageIds] = useState<string[]>([]);
    const resolvedSearchTaskIdsRef = useRef<Set<string>>(new Set());
    const appendRetryCountRef = useRef(0);
    const [state, dispatch] = useReducer(
        searchReducer,
        undefined,
        createInitialSearchState
    );
    const runSearch = useCallback(async (isAppending: boolean, submittedQuery?: string) => {
        const rawQuery = isAppending ? state.submittedQuery : (submittedQuery ?? state.query);
        const query = rawQuery.trim();
        const submittedQueryChanged = !isAppending
            && submittedQuery !== undefined
            && submittedQuery !== state.query;

        if (submittedQueryChanged) {
            dispatch({ type: 'queryChanged', query: submittedQuery });
        }

        if (query.length === 0 || (state.shouldPreserveState && !submittedQueryChanged)) {
            return;
        }

        const searchOffset = isAppending ? state.offset : 0;
        const existingArtistIds = isAppending ? state.artists.map(artist => artist.id) : [];

        if (state.pendingTaskId) {
            removeTask(state.pendingTaskId);
            dispatch({ type: 'searchTaskCleared' });
        }

        if (!isAppending) {
            appendRetryCountRef.current = 0;
            setPendingArtistImageIds([]);
        }

        dispatch({ type: 'searchStarted', isAppending, query });

        try {
            const task = addTask(
                async (): Promise<SearchTaskResult> => {
                    const artists: Artist[] = [];
                    const profileImageTasks: SearchProfileImageTask[] = [];
                    const seenArtistIds = new Set(existingArtistIds);
                    let nextOffset = searchOffset;
                    let allResultsFetched = false;

                    while (true) {
                        const pageOffset = nextOffset;
                        const pageResult = normalizeSearchPageResult(
                            await searchArtists(query, SEARCH_PAGE_SIZE, pageOffset)
                        );
                        const pageArtists = pageResult.artists;
                        const addedArtists = appendUniqueArtists(artists, pageArtists, seenArtistIds);
                        const fetchedCount = pageArtists.length;

                        const count = getPageCount(pageResult);
                        nextOffset = pageOffset + fetchedCount;

                        if (pageResult.profileImageTaskId && addedArtists.length > 0) {
                            profileImageTasks.push({
                                taskId: pageResult.profileImageTaskId,
                                query,
                                offset: pageOffset,
                                artistIds: addedArtists.map(artist => artist.id),
                            });
                        }

                        const reachedEnd = fetchedCount === 0
                            || fetchedCount < SEARCH_PAGE_SIZE
                            || nextOffset >= count;
                        if (addedArtists.length > 0 || reachedEnd) {
                            allResultsFetched = reachedEnd;
                            break;
                        }
                    }

                    return {
                        artists,
                        nextOffset,
                        allResultsFetched,
                        isAppending,
                        profileImageTasks,
                    };
                },
                'searchArtists',
                {
                    replayPolicy: 'both',
                }
            );

            dispatch({ type: 'searchTaskCreated', taskId: task.id });
            void executeTask(task);
        } catch (error) {
            console.error('search-page: queue artist search task failed', error);
            dispatch({ type: 'searchFailed' });
        }
    }, [
        addTask,
        executeTask,
        removeTask,
        searchArtists,
        state.artists,
        state.offset,
        state.pendingTaskId,
        state.query,
        state.shouldPreserveState,
        state.submittedQuery,
    ]);

    useEffect(() => {
        const taskId = state.pendingTaskId;
        if (!taskId) return;

        const task = tasks.find(item => item.id === taskId);
        if (!task) return;

        if (task.result === undefined && task.error === undefined) {
            return;
        }
        if (resolvedSearchTaskIdsRef.current.has(taskId)) {
            return;
        }
        resolvedSearchTaskIdsRef.current.add(taskId);

        removeTask(taskId);
        dispatch({ type: 'searchTaskCleared' });

        if (task.error) {
            if (!state.shouldPreserveState) {
                console.error('search-page: search task failed', task.error);
            }
            if (state.isAppending && appendRetryCountRef.current < 1) {
                appendRetryCountRef.current += 1;
                void runSearch(true);
                return;
            }

            dispatch({ type: 'searchFailed' });
            return;
        }

        const result = task.result as SearchTaskResult;
        if (result.isAppending) {
            appendRetryCountRef.current = 0;
        }
        const missingArtistImageIds = result.artists
            .map(artist => artist.id)
            .filter(artistId => !hasOwn(artistProfileImages, artistId));

        if (missingArtistImageIds.length > 0 && result.profileImageTasks.length > 0) {
            setPendingArtistImageIds(prev => Array.from(new Set([...prev, ...missingArtistImageIds])));

            void Promise.all(result.profileImageTasks.map(async (profileImageTask) => {
                const missingArtistImageIdsForTask = profileImageTask.artistIds
                    .filter(artistId => !hasOwn(artistProfileImages, artistId));

                if (missingArtistImageIdsForTask.length === 0) {
                    return;
                }

                await resolveNullableTaskMap({
                    taskId: profileImageTask.taskId,
                    expectedIds: missingArtistImageIdsForTask,
                    waitForTaskResult,
                    extractMap: extractArtistProfileImages,
                    onResolvedValues: (artistImages, resolvedArtistIds) => {
                        setArtistProfileImages(prev => mergeNullableStringMaps(prev, artistImages));
                        setPendingArtistImageIds(prev =>
                            prev.filter(artistId => !resolvedArtistIds.includes(artistId))
                        );
                    },
                    onError: error => {
                        console.error('search-page: resolve artist profile image task failed', error);
                    },
                    recreateTask: async () => {
                        const replayedResult = await searchArtists(
                            profileImageTask.query,
                            SEARCH_PAGE_SIZE,
                            profileImageTask.offset
                        );
                        return replayedResult.profileImageTaskId;
                    },
                    recreateTaskDescription: 'searchArtists.profileImageTaskId',
                });
            }));
        } else {
            setPendingArtistImageIds(prev =>
                prev.filter(artistId => !result.artists.some(artist => artist.id === artistId))
            );
        }

        dispatch({
            type: 'searchSucceeded',
            artists: result.artists,
            nextOffset: result.nextOffset,
            allResultsFetched: result.allResultsFetched,
            isAppending: result.isAppending,
        });
    }, [
        artistProfileImages,
        removeTask,
        runSearch,
        setArtistProfileImages,
        searchArtists,
        state.isAppending,
        state.pendingTaskId,
        state.shouldPreserveState,
        tasks,
        waitForTaskResult,
    ]);

    useFocusEffect(
        useCallback(() => {
            return () => {
                resolvedSearchTaskIdsRef.current.clear();
                appendRetryCountRef.current = 0;
                dispatch({ type: 'resetForBlur' });
            };
        }, [])
    );

    const onArtistPressed = useCallback((artistId: string) => {
        dispatch({ type: 'preserveStateChanged', shouldPreserveState: true });
        navigation.navigate('Artist', { artistId });
    }, [navigation]);

    const canLoadMore = state.submittedQuery.length > 0
        && state.query.trim() === state.submittedQuery
        && !state.isLoading
        && !state.allResultsFetched
        && state.artists.length > 0;

    const uiState: SearchPageUiState = {
        query: state.query,
        artists: state.artists,
        artistProfileImages,
        pendingArtistImageIds,
        isLoading: state.isLoading,
        canLoadMore,
    };

    return {
        state: uiState,
        onQueryChanged: (query: string) => dispatch({ type: 'queryChanged', query }),
        onSubmitSearch: async (query?: string) => {
            await runSearch(false, query);
        },
        onLoadMore: async () => {
            if (!canLoadMore) {
                return;
            }

            await runSearch(true);
        },
        onArtistPressed,
    };
}

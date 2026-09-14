import { useNavigation } from '@react-navigation/native';
import { useCallback, useReducer, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import type { ReleaseGroupSearchResultItem } from '../../../types/apiTypes';
import { useSearchApi } from '../api/searchApi';
import type { ReleaseGroupNavigationProp } from '../../../types/navigation';
import { addSearchHistoryEntry } from '../../../services/searchHistoryStorage';
import {
    mergeNullableStringMaps,
    normalizeNullableStringMap,
    type NullableStringMap,
} from '../../../utils/nullableMaps';
import { extractReleaseGroupCovers } from '../../../utils/taskResultMaps';
import { resolveNullableTaskMap } from '../../../shared/taskResults/resolveNullableTaskMap';
import {
    createInitialReleaseGroupSearchState,
    releaseGroupSearchReducer,
    type ReleaseGroupSearchState,
} from '../state/releaseGroupSearchReducer';

const PAGE_SIZE = 10;

export interface ReleaseGroupSearchController {
    state: ReleaseGroupSearchState;
    canLoadMore: boolean;
    onSubmitSearch: (query: string) => Promise<void>;
    onLoadMore: () => Promise<void>;
    onQueryChanged: (query: string) => void;
    onReleaseGroupPressed: (releaseGroupId: string) => void;
    onCleared: () => void;
}

/**
 * Release-group search mirrors artist search's asset handling: results render
 * immediately with whatever covers are already cached, and the remainder are
 * filled in as the background cover task resolves. The search itself is never
 * blocked on cover fetching.
 */
export function useReleaseGroupSearch(): ReleaseGroupSearchController {
    const navigation = useNavigation<ReleaseGroupNavigationProp>();
    const { searchReleaseGroups, waitForTaskResultById } = useSearchApi();
    const { showToast } = useToast();
    const [state, dispatch] = useReducer(
        releaseGroupSearchReducer,
        undefined,
        createInitialReleaseGroupSearchState,
    );
    const inFlightRef = useRef(false);

    const resolveCoverTask = useCallback(
        async (taskId: string, expectedIds: string[]) => {
            await resolveNullableTaskMap({
                taskId,
                expectedIds,
                waitForTaskResult: waitForTaskResultById,
                extractMap: extractReleaseGroupCovers,
                onResolvedValues: (covers, resolvedIds) => {
                    dispatch({ type: 'coversResolved', releaseGroupCovers: covers, resolvedIds });
                },
                onError: (error) => {
                    console.error('release-group-search: resolve cover task failed', error);
                },
            });
        },
        [waitForTaskResultById],
    );

    const runSearch = useCallback(
        async (isAppending: boolean, rawQuery: string) => {
            const query = rawQuery.trim();
            if (!query || inFlightRef.current) {
                return;
            }

            const searchOffset = isAppending ? state.offset : 0;
            if (!isAppending) {
                dispatch({ type: 'searchStarted', query });
            }

            inFlightRef.current = true;
            try {
                const seenIds = new Set(
                    isAppending ? state.releaseGroups.map((group) => group.id) : [],
                );
                const releaseGroups: ReleaseGroupSearchResultItem[] = [];
                const resolvedCovers: NullableStringMap = {};
                const coverTasks: Array<{ taskId: string; releaseGroupIds: string[] }> = [];
                let nextOffset = searchOffset;
                let allResultsFetched = false;

                while (true) {
                    const result = await searchReleaseGroups(query, PAGE_SIZE, nextOffset);
                    const fresh = result.releaseGroups.filter(
                        (group) => !seenIds.has(group.id),
                    );
                    fresh.forEach((group) => seenIds.add(group.id));
                    releaseGroups.push(...fresh);
                    Object.assign(resolvedCovers, normalizeNullableStringMap(result.releaseGroupCovers));

                    if (result.releaseGroupCoverTaskId && fresh.length > 0) {
                        const pendingIds = fresh
                            .map((group) => group.id)
                            .filter((releaseGroupId) => resolvedCovers[releaseGroupId] === undefined);
                        if (pendingIds.length > 0) {
                            coverTasks.push({
                                taskId: result.releaseGroupCoverTaskId,
                                releaseGroupIds: pendingIds,
                            });
                        }
                    }

                    const fetchedCount = result.releaseGroups.length;
                    nextOffset += fetchedCount;

                    const reachedEnd =
                        fetchedCount === 0 ||
                        fetchedCount < PAGE_SIZE ||
                        nextOffset >= result.count;
                    if (fresh.length > 0 || reachedEnd) {
                        allResultsFetched = reachedEnd;
                        break;
                    }
                }

                dispatch({
                    type: 'searchSucceeded',
                    releaseGroups,
                    releaseGroupCovers: resolvedCovers,
                    pendingCoverIds: coverTasks.flatMap((task) => task.releaseGroupIds),
                    nextOffset,
                    allResultsFetched,
                    isAppending,
                });

                // Covers stream in after the results are already on screen.
                void Promise.all(
                    coverTasks.map((task) => resolveCoverTask(task.taskId, task.releaseGroupIds)),
                );

                if (!isAppending) {
                    void addSearchHistoryEntry(query, 'releases');
                }
            } catch (error) {
                console.error('release-group-search: search failed', error);
                showToast(
                    getUserFacingErrorMessage(error, 'Release search failed.'),
                    'error',
                );
                dispatch({ type: 'searchFailed' });
            } finally {
                inFlightRef.current = false;
            }
        },
        [resolveCoverTask, searchReleaseGroups, showToast, state.offset, state.releaseGroups],
    );

    const onSubmitSearch = useCallback(
        async (query: string) => await runSearch(false, query),
        [runSearch],
    );

    const onLoadMore = useCallback(async () => {
        if (state.allResultsFetched || !state.submittedQuery) {
            return;
        }

        await runSearch(true, state.submittedQuery);
    }, [runSearch, state.allResultsFetched, state.submittedQuery]);

    const onReleaseGroupPressed = useCallback(
        (releaseGroupId: string) => {
            navigation.navigate('ReleaseGroup', { releaseGroupId });
        },
        [navigation],
    );

    const onQueryChanged = useCallback(
        (query: string) => dispatch({ type: 'queryChanged', query }),
        [],
    );

    const onCleared = useCallback(() => dispatch({ type: 'cleared' }), []);

    return {
        state,
        canLoadMore: !state.allResultsFetched && state.releaseGroups.length > 0,
        onSubmitSearch,
        onLoadMore,
        onQueryChanged,
        onReleaseGroupPressed,
        onCleared,
    };
}

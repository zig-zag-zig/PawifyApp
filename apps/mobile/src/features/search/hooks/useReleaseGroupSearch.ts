import { useNavigation } from '@react-navigation/native';
import { useCallback, useReducer, useRef } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';
import type { ReleaseGroupSearchResultItem } from '../../../types/apiTypes';
import { useSearchApi } from '../api/searchApi';
import type { ReleaseGroupNavigationProp } from '../../../types/navigation';
import { addSearchHistoryEntry } from '../../../services/searchHistoryStorage';

const PAGE_SIZE = 10;

type ReleaseGroupSearchState = {
    releaseGroups: ReleaseGroupSearchResultItem[];
    isLoading: boolean;
    allResultsFetched: boolean;
    offset: number;
    submittedQuery: string;
};

type ReleaseGroupSearchAction =
    | { type: 'searchStarted'; query: string }
    | { type: 'searchSucceeded'; releaseGroups: ReleaseGroupSearchResultItem[]; nextOffset: number; allResultsFetched: boolean; isAppending: boolean }
    | { type: 'searchFailed' }
    | { type: 'cleared' };

const createInitialState = (): ReleaseGroupSearchState => ({
    releaseGroups: [],
    isLoading: false,
    allResultsFetched: false,
    offset: 0,
    submittedQuery: '',
});

const reducer = (
    state: ReleaseGroupSearchState,
    action: ReleaseGroupSearchAction,
): ReleaseGroupSearchState => {
    switch (action.type) {
        case 'searchStarted':
            return {
                ...state,
                isLoading: true,
                submittedQuery: action.query,
                releaseGroups: [],
                offset: 0,
                allResultsFetched: false,
            };
        case 'searchSucceeded': {
            const releaseGroups = action.isAppending
                ? [...state.releaseGroups, ...action.releaseGroups]
                : action.releaseGroups;
            return {
                ...state,
                isLoading: false,
                releaseGroups,
                offset: action.nextOffset,
                allResultsFetched: action.allResultsFetched,
            };
        }
        case 'searchFailed':
            return { ...state, isLoading: false };
        case 'cleared':
            return createInitialState();
    }
};

export interface ReleaseGroupSearchController {
    state: ReleaseGroupSearchState;
    canLoadMore: boolean;
    onSubmitSearch: (query: string) => Promise<void>;
    onLoadMore: () => Promise<void>;
    onReleaseGroupPressed: (releaseGroupId: string) => void;
    onCleared: () => void;
}

/**
 * Release-group search is deliberately simpler than the artist search path:
 * no profile-image tasks, no replay — just paged MusicBrainz results.
 */
export function useReleaseGroupSearch(): ReleaseGroupSearchController {
    const navigation = useNavigation<ReleaseGroupNavigationProp>();
    const { searchReleaseGroups } = useSearchApi();
    const { showToast } = useToast();
    const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
    const inFlightRef = useRef(false);

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
                let nextOffset = searchOffset;
                let allResultsFetched = false;

                while (true) {
                    const result = await searchReleaseGroups(query, PAGE_SIZE, nextOffset);
                    const fresh = result.releaseGroups.filter(
                        (group) => !seenIds.has(group.id),
                    );
                    fresh.forEach((group) => seenIds.add(group.id));
                    releaseGroups.push(...fresh);
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
                    nextOffset,
                    allResultsFetched,
                    isAppending,
                });

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
        [searchReleaseGroups, showToast, state.offset, state.releaseGroups],
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

    const onCleared = useCallback(() => dispatch({ type: 'cleared' }), []);

    return {
        state,
        canLoadMore: !state.allResultsFetched && state.releaseGroups.length > 0,
        onSubmitSearch,
        onLoadMore,
        onReleaseGroupPressed,
        onCleared,
    };
}

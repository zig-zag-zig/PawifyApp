import type { ReleaseGroupSearchResultItem } from '../../../types/apiTypes';
import {
    mergeNullableStringMaps,
    type NullableStringMap,
} from '../../../utils/nullableMaps';

export type ReleaseGroupSearchState = {
    releaseGroups: ReleaseGroupSearchResultItem[];
    releaseGroupCovers: NullableStringMap;
    pendingCoverIds: string[];
    isLoading: boolean;
    allResultsFetched: boolean;
    offset: number;
    submittedQuery: string;
};

export type ReleaseGroupSearchAction =
    | { type: 'searchStarted'; query: string }
    | {
        type: 'searchSucceeded';
        releaseGroups: ReleaseGroupSearchResultItem[];
        releaseGroupCovers: NullableStringMap;
        pendingCoverIds: string[];
        nextOffset: number;
        allResultsFetched: boolean;
        isAppending: boolean;
    }
    | { type: 'coversResolved'; releaseGroupCovers: NullableStringMap; resolvedIds: string[] }
    | { type: 'queryChanged'; query: string }
    | { type: 'searchFailed' }
    | { type: 'cleared' };

export const createInitialReleaseGroupSearchState = (): ReleaseGroupSearchState => ({
    releaseGroups: [],
    releaseGroupCovers: {},
    pendingCoverIds: [],
    isLoading: false,
    allResultsFetched: false,
    offset: 0,
    submittedQuery: '',
});

export function releaseGroupSearchReducer(
    state: ReleaseGroupSearchState,
    action: ReleaseGroupSearchAction,
): ReleaseGroupSearchState {
    switch (action.type) {
        case 'searchStarted':
            return {
                ...state,
                isLoading: true,
                submittedQuery: action.query,
                releaseGroups: [],
                releaseGroupCovers: {},
                pendingCoverIds: [],
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
                releaseGroupCovers: mergeNullableStringMaps(
                    state.releaseGroupCovers,
                    action.releaseGroupCovers,
                ),
                pendingCoverIds: action.isAppending
                    ? [...state.pendingCoverIds, ...action.pendingCoverIds]
                    : action.pendingCoverIds,
                offset: action.nextOffset,
                allResultsFetched: action.allResultsFetched,
            };
        }
        case 'coversResolved':
            return {
                ...state,
                releaseGroupCovers: mergeNullableStringMaps(
                    state.releaseGroupCovers,
                    action.releaseGroupCovers,
                ),
                pendingCoverIds: state.pendingCoverIds.filter(
                    (releaseGroupId) => !action.resolvedIds.includes(releaseGroupId),
                ),
            };
        case 'queryChanged': {
            // Results belong to submittedQuery, so drop them once the typed
            // query diverges rather than showing a previous search's results
            // under a new query.
            if (action.query.trim() === state.submittedQuery) {
                return state;
            }

            return {
                ...state,
                releaseGroups: [],
                releaseGroupCovers: {},
                pendingCoverIds: [],
                offset: 0,
                allResultsFetched: false,
            };
        }
        case 'searchFailed':
            return { ...state, isLoading: false };
        case 'cleared':
            return createInitialReleaseGroupSearchState();
    }
}

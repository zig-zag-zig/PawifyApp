import type { Artist } from '@pawify/shared';
import type { SearchPageState } from '../model/types';

type SearchAction =
    | { type: 'queryChanged'; query: string }
    | { type: 'searchStarted'; isAppending: boolean; query: string }
    | { type: 'searchTaskCreated'; taskId: string }
    | { type: 'searchSucceeded'; artists: Artist[]; nextOffset: number; allResultsFetched: boolean; isAppending: boolean }
    | { type: 'searchFailed' }
    | { type: 'searchTaskCleared' }
    | { type: 'preserveStateChanged'; shouldPreserveState: boolean }
    | { type: 'resetForBlur' };

export const SEARCH_PAGE_SIZE = 10;

export function createInitialSearchState(): SearchPageState {
    return {
        query: '',
        submittedQuery: '',
        artists: [],
        artistProfileImages: {},
        allResultsFetched: false,
        isLoading: false,
        offset: 0,
        pendingTaskId: null,
        shouldPreserveState: false,
        isAppending: false,
    };
}

export function searchReducer(state: SearchPageState, action: SearchAction): SearchPageState {
    switch (action.type) {
        case 'queryChanged':
            return {
                ...state,
                query: action.query,
                shouldPreserveState: false,
            };

        case 'searchStarted':
            return {
                ...state,
                isLoading: true,
                isAppending: action.isAppending,
                submittedQuery: action.query,
                ...(action.isAppending
                    ? {}
                    : {
                        artists: [],
                        offset: 0,
                        allResultsFetched: false,
                    }),
            };

        case 'searchTaskCreated':
            return {
                ...state,
                pendingTaskId: action.taskId,
            };

        case 'searchSucceeded':
            return {
                ...state,
                isLoading: false,
                artists: action.isAppending
                    ? [...state.artists, ...action.artists]
                    : action.artists,
                allResultsFetched: action.allResultsFetched,
                offset: action.nextOffset,
                isAppending: false,
            };

        case 'searchFailed':
            return {
                ...state,
                isLoading: false,
                isAppending: false,
            };

        case 'searchTaskCleared':
            return {
                ...state,
                pendingTaskId: null,
            };

        case 'preserveStateChanged':
            return {
                ...state,
                shouldPreserveState: action.shouldPreserveState,
            };

        case 'resetForBlur':
            if (state.shouldPreserveState) {
                return {
                    ...state,
                    shouldPreserveState: false,
                };
            }

            return {
                ...createInitialSearchState(),
            };

        default:
            return state;
    }
}

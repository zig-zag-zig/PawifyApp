import type { ReleasesPageState } from '../model/types';

type ReleasesAction =
    | { type: 'pageIncreased' }
    | { type: 'pageReset' };

export function createInitialReleasesState(): ReleasesPageState {
    return {
        page: 0,
    };
}

export function releasesReducer(
    state: ReleasesPageState,
    action: ReleasesAction
): ReleasesPageState {
    switch (action.type) {
        case 'pageIncreased':
            return {
                ...state,
                page: state.page + 1,
            };

        case 'pageReset':
            return {
                ...state,
                page: 0,
            };

        default:
            return state;
    }
}

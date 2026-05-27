import type { ArtistMinimal } from '../../../modules/models/models';
import type { ArtistsPageState } from '../model/types';

type ArtistsAction =
    | { type: 'artistsLoaded'; artists: ArtistMinimal[] }
    | { type: 'loadingChanged'; isLoading: boolean };

export function createInitialArtistsState(): ArtistsPageState {
    return {
        artists: [],
        isLoading: true,
    };
}

export function artistsReducer(
    state: ArtistsPageState,
    action: ArtistsAction
): ArtistsPageState {
    switch (action.type) {
        case 'artistsLoaded':
            return {
                ...state,
                artists: action.artists,
            };

        case 'loadingChanged':
            return {
                ...state,
                isLoading: action.isLoading,
            };

        default:
            return state;
    }
}

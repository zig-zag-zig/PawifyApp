import type { Release, Track } from '@pawify/shared';
import type { ReleasePageState } from '../model/types';
import { removeIds } from '../../../utils/arrays';

type ReleaseAction =
    | { type: 'releaseLoadStarted' }
    | { type: 'releaseLoadFailed'; notFound: boolean }
    | {
        type: 'releaseLoaded';
        release: Release;
        trackLyrics: Record<string, string | null | undefined>;
        artistProfileImages: Record<string, string | null | undefined>;
        pendingLyricTrackIds: string[];
        pendingArtistImageIds: string[];
    }
    | {
        type: 'lyricsLoadingFinished';
        trackLyrics: Record<string, string | null | undefined>;
        resolvedLyricTrackIds: string[];
    }
    | {
        type: 'artistImagesLoadingFinished';
        artistProfileImages: Record<string, string | null | undefined>;
        resolvedArtistImageIds: string[];
    }
    | { type: 'songToggled'; track: Track };

export function createInitialReleaseState(): ReleasePageState {
    return {
        release: null,
        selectedSong: null,
        trackLyrics: {},
        artistProfileImages: {},
        pendingLyricTrackIds: [],
        pendingArtistImageIds: [],
        loadingLyrics: false,
        releaseExists: null,
        checkingExistence: true,
        loadFailed: false,
    };
}

export function releaseReducer(state: ReleasePageState, action: ReleaseAction): ReleasePageState {
    switch (action.type) {
        case 'releaseLoadStarted':
            return createInitialReleaseState();

        case 'releaseLoadFailed':
            return {
                ...state,
                release: null,
                selectedSong: null,
                trackLyrics: {},
                artistProfileImages: {},
                pendingLyricTrackIds: [],
                pendingArtistImageIds: [],
                loadingLyrics: false,
                // A 404 is a local not-found; anything else may succeed on retry.
                releaseExists: action.notFound ? false : state.releaseExists,
                checkingExistence: false,
                loadFailed: !action.notFound,
            };

        case 'releaseLoaded':
            return {
                ...state,
                release: action.release,
                releaseExists: true,
                checkingExistence: false,
                loadFailed: false,
                trackLyrics: action.trackLyrics,
                artistProfileImages: action.artistProfileImages,
                pendingLyricTrackIds: action.pendingLyricTrackIds,
                pendingArtistImageIds: action.pendingArtistImageIds,
                loadingLyrics: action.pendingLyricTrackIds.length > 0,
            };

        case 'lyricsLoadingFinished': {
            const pendingLyricTrackIds = removeIds(
                state.pendingLyricTrackIds,
                action.resolvedLyricTrackIds
            );

            // Asset-only update: never replace the release object or clear the
            // user's selected track when enrichment arrives.
            return {
                ...state,
                trackLyrics: action.trackLyrics,
                pendingLyricTrackIds,
                loadingLyrics: pendingLyricTrackIds.length > 0,
            };
        }

        case 'artistImagesLoadingFinished':
            return {
                ...state,
                artistProfileImages: {
                    ...state.artistProfileImages,
                    ...action.artistProfileImages,
                },
                pendingArtistImageIds: removeIds(
                    state.pendingArtistImageIds,
                    action.resolvedArtistImageIds
                ),
            };

        case 'songToggled':
            return {
                ...state,
                selectedSong: state.selectedSong?.id === action.track.id ? null : action.track,
            };

        default:
            return state;
    }
}

import type { Release, Track } from '../../../modules/models/models';
import type { ReleasePageState } from '../model/types';

type ReleaseAction =
    | { type: 'releaseLoadStarted' }
    | { type: 'releaseLoadFailed' }
    | {
        type: 'lyricsLoadingStarted';
        release: Release;
        trackLyrics: Record<string, string | null | undefined>;
        artistProfileImages: Record<string, string | null | undefined>;
        pendingLyricTrackIds: string[];
        pendingArtistImageIds: string[];
    }
    | {
        type: 'lyricsLoadingFinished';
        release: Release;
        trackLyrics: Record<string, string | null | undefined>;
        resolvedLyricTrackIds: string[];
    }
    | {
        type: 'artistImagesLoadingFinished';
        release: Release;
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
    };
}

function removeIds(existingIds: string[], idsToRemove: string[]): string[] {
    if (existingIds.length === 0 || idsToRemove.length === 0) {
        return existingIds;
    }

    const idsToRemoveSet = new Set(idsToRemove);
    return existingIds.filter(id => !idsToRemoveSet.has(id));
}

export function releaseReducer(state: ReleasePageState, action: ReleaseAction): ReleasePageState {
    switch (action.type) {
        case 'releaseLoadStarted':
            return {
                ...createInitialReleaseState(),
            };

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
                releaseExists: false,
                checkingExistence: false,
            };

        case 'lyricsLoadingStarted':
            return {
                ...state,
                release: action.release,
                releaseExists: true,
                checkingExistence: false,
                trackLyrics: action.trackLyrics,
                artistProfileImages: action.artistProfileImages,
                pendingLyricTrackIds: action.pendingLyricTrackIds,
                pendingArtistImageIds: action.pendingArtistImageIds,
                loadingLyrics: action.pendingLyricTrackIds.length > 0,
                selectedSong: null,
            };

        case 'lyricsLoadingFinished': {
            const pendingLyricTrackIds = removeIds(
                state.pendingLyricTrackIds,
                action.resolvedLyricTrackIds
            );

            return {
                ...state,
                release: action.release,
                trackLyrics: action.trackLyrics,
                pendingLyricTrackIds,
                loadingLyrics: pendingLyricTrackIds.length > 0,
            };
        }

        case 'artistImagesLoadingFinished':
            return {
                ...state,
                release: action.release,
                artistProfileImages: action.artistProfileImages,
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

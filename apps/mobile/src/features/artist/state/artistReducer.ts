import type { Artist, ArtistReleaseGroup } from '@pawify/shared';
import { buildInitialLoadedItemsByType, DEFAULT_RELEASE_ITEMS_TO_SHOW } from '../domain/releaseSections';
import type { ArtistPageState, PendingTaskKey } from '../model/types';
import { mergeUniqueIds, removeIds } from '../../../utils/arrays';

export type ArtistPageAction =
    | { type: 'artistLoadStarted' }
    | { type: 'artistLoadSucceeded'; artist: Artist }
    | { type: 'artistLoadFailed'; message: string }
    | { type: 'releasesLoadStarted' }
    | { type: 'releasesLoadSucceeded'; releaseGroups: ArtistReleaseGroup[] }
    | { type: 'releasesLoadFailed'; message: string }
    | { type: 'followToggleStarted' }
    | { type: 'followToggleFinished' }
    | { type: 'followToggleFailed'; message: string }
    | { type: 'releaseGroupLoadStarted' }
    | { type: 'releaseGroupLoadFinished' }
    | { type: 'pendingTaskUpdated'; key: PendingTaskKey; taskId: string | null }
    | { type: 'memberPictureQueued'; memberId: string }
    | { type: 'memberPictureResolved'; memberId: string }
    | { type: 'artistImageLoadQueued'; artistIds: string[] }
    | { type: 'artistImageLoadFinished'; artistIds: string[] }
    | { type: 'releaseGroupCoverLoadQueued'; releaseGroupIds: string[] }
    | { type: 'releaseGroupCoverLoadFinished'; releaseGroupIds: string[] }
    | { type: 'releaseSectionLoadMore'; sectionTitle: string }
    | { type: 'errorCleared' }
    | { type: 'resetForArtistChange' };

export function createInitialArtistPageState(): ArtistPageState {
    return {
        artist: undefined,
        allReleaseGroups: [],
        membersWithoutCachedPicture: [],
        pendingArtistImageIds: [],
        pendingReleaseGroupCoverIds: [],
        loadedItemsByType: buildInitialLoadedItemsByType(),
        isLoadingArtist: true,
        isLoadingReleases: true,
        isLoadingReleaseGroup: false,
        isFollowLoading: false,
        error: null,
        pendingTasks: {
            artistTaskId: null,
            releasesTaskId: null,
        },
    };
}

export function artistReducer(state: ArtistPageState, action: ArtistPageAction): ArtistPageState {
    switch (action.type) {
        case 'artistLoadStarted':
            return {
                ...state,
                isLoadingArtist: true,
                error: null,
            };

        case 'artistLoadSucceeded':
            return {
                ...state,
                artist: action.artist,
                isLoadingArtist: false,
                error: null,
            };

        case 'artistLoadFailed':
            return {
                ...state,
                isLoadingArtist: false,
                error: action.message,
            };

        case 'releasesLoadStarted':
            return {
                ...state,
                isLoadingReleases: true,
                error: null,
            };

        case 'releasesLoadSucceeded':
            return {
                ...state,
                allReleaseGroups: action.releaseGroups,
                isLoadingReleases: false,
                error: null,
            };

        case 'releasesLoadFailed':
            return {
                ...state,
                isLoadingReleases: false,
                error: action.message,
            };

        case 'followToggleStarted':
            return {
                ...state,
                isFollowLoading: true,
                error: null,
            };

        case 'followToggleFinished':
            return {
                ...state,
                isFollowLoading: false,
            };

        case 'followToggleFailed':
            return {
                ...state,
                isFollowLoading: false,
                error: action.message,
            };

        case 'releaseGroupLoadStarted':
            return {
                ...state,
                isLoadingReleaseGroup: true,
            };

        case 'releaseGroupLoadFinished':
            return {
                ...state,
                isLoadingReleaseGroup: false,
            };

        case 'pendingTaskUpdated':
            return {
                ...state,
                pendingTasks: {
                    ...state.pendingTasks,
                    [action.key]: action.taskId,
                },
            };

        case 'memberPictureQueued':
            if (state.membersWithoutCachedPicture.includes(action.memberId)) {
                return state;
            }

            return {
                ...state,
                membersWithoutCachedPicture: [...state.membersWithoutCachedPicture, action.memberId],
            };

        case 'memberPictureResolved':
            return {
                ...state,
                membersWithoutCachedPicture: state.membersWithoutCachedPicture.filter(
                    memberId => memberId !== action.memberId
                ),
            };

        case 'artistImageLoadQueued':
            return {
                ...state,
                pendingArtistImageIds: mergeUniqueIds(state.pendingArtistImageIds, action.artistIds),
            };

        case 'artistImageLoadFinished':
            return {
                ...state,
                pendingArtistImageIds: removeIds(state.pendingArtistImageIds, action.artistIds),
            };

        case 'releaseGroupCoverLoadQueued':
            return {
                ...state,
                pendingReleaseGroupCoverIds: mergeUniqueIds(state.pendingReleaseGroupCoverIds, action.releaseGroupIds),
            };

        case 'releaseGroupCoverLoadFinished':
            return {
                ...state,
                pendingReleaseGroupCoverIds: removeIds(state.pendingReleaseGroupCoverIds, action.releaseGroupIds),
            };

        case 'releaseSectionLoadMore':
            return {
                ...state,
                loadedItemsByType: {
                    ...state.loadedItemsByType,
                    [action.sectionTitle]: (state.loadedItemsByType[action.sectionTitle] ?? DEFAULT_RELEASE_ITEMS_TO_SHOW) + DEFAULT_RELEASE_ITEMS_TO_SHOW,
                },
            };

        case 'errorCleared':
            return {
                ...state,
                error: null,
            };

        case 'resetForArtistChange':
            return {
                ...createInitialArtistPageState(),
            };

        default:
            return state;
    }
}

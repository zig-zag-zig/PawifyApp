import type { ArtistMinimal } from '@pawify/shared';

export interface ArtistsPageState {
    artists: ArtistMinimal[];
    isLoading: boolean;
}

export interface ArtistsPageUiState {
    /** Full list, used for selection and removal bookkeeping. */
    artists: ArtistMinimal[];
    /** The slice actually rendered; artwork is requested for this slice only. */
    visibleArtists: ArtistMinimal[];
    hasMoreArtists: boolean;
    onLoadMoreArtists: () => void;
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isLoading: boolean;
    hasLoadedOnce: boolean;
    showBanner: boolean;
}

export interface ArtistsPageController {
    state: ArtistsPageUiState;
    onArtistPressed: (artistId: string, isInSelectionMode: boolean, onSelect: () => void) => void;
    onRemoveSelected: (artistIds: string[]) => void;
    onBannerVisibilityChanged: (visible: boolean) => void;
}

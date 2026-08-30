import type { ArtistMinimal } from '../../../shared/music';

export interface ArtistsPageState {
    artists: ArtistMinimal[];
    isLoading: boolean;
}

export interface ArtistsPageUiState {
    artists: ArtistMinimal[];
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

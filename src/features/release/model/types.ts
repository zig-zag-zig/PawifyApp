import type { NewReleaseListItem } from '../../../contexts/NewReleasesContext';
import type { Release, ReleaseGroupReleaseListItem, Track } from '../../../modules/models/models';

export interface ReleasesPageState {
    page: number;
}

export interface ReleasesPageUiState {
    displayedReleases: NewReleaseListItem[];
    allReleases: NewReleaseListItem[];
    pendingReleaseCoverIds: string[];
    isLoading: boolean;
    hasLoadedOnce: boolean;
    showBanner: boolean;
}

export interface ReleasePageState {
    release: Release | null;
    selectedSong: Track | null;
    trackLyrics: Record<string, string | null | undefined>;
    artistProfileImages: Record<string, string | null | undefined>;
    pendingLyricTrackIds: string[];
    pendingArtistImageIds: string[];
    loadingLyrics: boolean;
    releaseExists: boolean | null;
    checkingExistence: boolean;
}

export interface ReleasePageUiState {
    release: Release | null;
    selectedSong: Track | null;
    trackLyrics: Record<string, string | null | undefined>;
    artistProfileImages: Record<string, string | null | undefined>;
    pendingLyricTrackIds: string[];
    pendingArtistImageIds: string[];
    loadingLyrics: boolean;
    releaseExists: boolean | null;
    checkingExistence: boolean;
}

export interface ReleaseGroupPageUiState {
    releases: ReleaseGroupReleaseListItem[];
    releaseGroupReleaseCovers: Record<string, string | null | undefined>;
    pendingReleaseCoverIds: string[];
}

export interface ReleasesPageController {
    state: ReleasesPageUiState;
    onLoadMore: () => void;
    onRemoveSelected: (releaseIds: string[]) => void;
    onReleasePressed: (release: NewReleaseListItem, isInSelectionMode: boolean, onSelect: () => void) => void;
    onBannerVisibilityChanged: (visible: boolean) => void;
}

export interface ReleasePageController {
    state: ReleasePageUiState;
    onSongPressed: (track: Track) => void;
    onLyricsOpened: (track: Track) => void;
}

export interface ReleaseGroupPageController {
    state: ReleaseGroupPageUiState;
    onReleasePressed: (release: ReleaseGroupReleaseListItem) => void;
}

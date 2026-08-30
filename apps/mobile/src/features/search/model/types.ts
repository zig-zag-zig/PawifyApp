import type { Artist } from '@pawify/shared';

export interface SearchPageState {
    query: string;
    submittedQuery: string;
    artists: Artist[];
    artistProfileImages: Record<string, string | null | undefined>;
    allResultsFetched: boolean;
    isLoading: boolean;
    offset: number;
    pendingTaskId: string | null;
    shouldPreserveState: boolean;
    isAppending: boolean;
}

export interface SearchPageUiState {
    query: string;
    artists: Artist[];
    artistProfileImages: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    isLoading: boolean;
    canLoadMore: boolean;
}

export interface SearchPageController {
    state: SearchPageUiState;
    onQueryChanged: (query: string) => void;
    onSubmitSearch: (query?: string) => Promise<void>;
    onLoadMore: () => Promise<void>;
    onArtistPressed: (artistId: string) => void;
}

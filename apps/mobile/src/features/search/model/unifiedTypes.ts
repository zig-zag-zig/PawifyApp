import type { Artist } from '@pawify/shared';
import type { ReleaseGroupSearchResultItem, UnifiedSearchResponse } from '../../../types/apiTypes';

export type SearchFilter = 'artists' | 'releases' | 'tracks';

export type UnifiedTrackResult = UnifiedSearchResponse['recordings'][number];

export type UnifiedSearchState = {
    query: string;
    submittedQuery: string;
    artists: Artist[];
    releaseGroups: ReleaseGroupSearchResultItem[];
    tracks: UnifiedTrackResult[];
    artistCount: number;
    releaseGroupCount: number;
    trackCount: number;
    artistProfileImages: Record<string, string | null | undefined>;
    releaseGroupCovers: Record<string, string | null | undefined>;
    trackCovers: Record<string, string | null | undefined>;
    pendingTrackCoverIds: string[];
    pendingArtistImageIds: string[];
    pendingReleaseGroupCoverIds: string[];
    hasSubmittedSearch: boolean;
    isLoading: boolean;
    /** Server offsets: how many rows we have fetched per category. */
    artistOffset: number;
    releaseGroupOffset: number;
    trackOffset: number;
    /** Local reveal counters: how many fetched rows the user can currently see. */
    artistVisible: number;
    releaseGroupVisible: number;
    trackVisible: number;
    artistsAllFetched: boolean;
    releaseGroupsAllFetched: boolean;
    tracksAllFetched: boolean;
    isLoadingArtists: boolean;
    isLoadingReleaseGroups: boolean;
    isLoadingTracks: boolean;
    /** Auto-selected first category with results (artists -> releases -> tracks tie-break). */
    firstLoadedScope: SearchFilter | null;
};

export const createInitialUnifiedSearchState = (): UnifiedSearchState => ({
    query: '',
    submittedQuery: '',
    artists: [],
    releaseGroups: [],
    tracks: [],
    artistCount: 0,
    releaseGroupCount: 0,
    trackCount: 0,
    artistProfileImages: {},
    releaseGroupCovers: {},
    trackCovers: {},
    pendingTrackCoverIds: [],
    pendingArtistImageIds: [],
    pendingReleaseGroupCoverIds: [],
    hasSubmittedSearch: false,
    isLoading: false,
    artistOffset: 0,
    releaseGroupOffset: 0,
    trackOffset: 0,
    artistVisible: 0,
    releaseGroupVisible: 0,
    trackVisible: 0,
    artistsAllFetched: false,
    releaseGroupsAllFetched: false,
    tracksAllFetched: false,
    isLoadingArtists: false,
    isLoadingReleaseGroups: false,
    isLoadingTracks: false,
    firstLoadedScope: null,
});

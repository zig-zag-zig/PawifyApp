import type { Artist } from '@pawify/shared';
import type { ReleaseGroupSearchResultItem, UnifiedSearchResponse } from '../../../types/apiTypes';

export type SearchFilter = 'all' | 'artists' | 'releases' | 'tracks';

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
    offset: number;
    allResultsFetched: boolean;
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
    offset: 0,
    allResultsFetched: false,
});

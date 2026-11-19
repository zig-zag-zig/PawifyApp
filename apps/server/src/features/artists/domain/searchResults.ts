import type { ArtistCredit, ArtistMinimal } from '@pawify/shared';

/**
 * Local catalogue search result shapes.
 *
 * These used to live in the MusicBrainz Web Service search modules. Keeping the
 * wire types in the artists domain lets use cases/repositories share them
 * without an import that can reintroduce a remote catalogue dependency.
 */
export interface ArtistSearchResult {
    artists: ArtistMinimal[];
    count: number;
}

export interface ReleaseGroupSearchResultItem {
    id: string;
    title: string;
    'primary-type': string | null;
    'first-release-date': string | null;
    'artist-credit': ArtistCredit[];
}

export interface ReleaseGroupSearchResult {
    releaseGroups: ReleaseGroupSearchResultItem[];
    count: number;
}

export type RecordingSearchResultItem = {
    id: string;
    title: string;
    'artist-credit': ArtistCredit[];
    /**
     * One release the recording appears on, used to show its cover and open the
     * release screen from a track result.
     */
    release: {
        id: string;
        title: string;
        releaseGroupId: string | null;
        date: string | null;
    } | null;
};

export type RecordingSearchResult = {
    recordings: RecordingSearchResultItem[];
    count: number;
};

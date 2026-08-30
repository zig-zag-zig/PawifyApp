import type { Artist, ArtistReleaseGroup } from '@pawify/shared';

interface ArtistPendingTasks {
    artistTaskId: string | null;
    releasesTaskId: string | null;
}

export interface ArtistPageState {
    artist: Artist | undefined;
    allReleaseGroups: ArtistReleaseGroup[];
    membersWithoutCachedPicture: string[];
    pendingArtistImageIds: string[];
    pendingReleaseGroupCoverIds: string[];
    loadedItemsByType: Record<string, number>;
    isLoadingArtist: boolean;
    isLoadingReleases: boolean;
    isLoadingReleaseGroup: boolean;
    isFollowLoading: boolean;
    error: string | null;
    pendingTasks: ArtistPendingTasks;
}

export type PendingTaskKey = keyof ArtistPendingTasks;

export interface ReleaseGroupSection {
    title: string;
    releaseGroups: ArtistReleaseGroup[];
}

export interface ArtistRelationshipBuckets {
    groupMembers: MemberRelationship[];
    memberOfGroups: MemberRelationship[];
    subgroupOf: MemberRelationship[];
    subgroups: MemberRelationship[];
}

export interface MemberRelationship {
    id: string;
    name: string;
    begin: string | null;
    end: string | null;
}

export interface ArtistRelationshipGroup {
    title: string;
    data: MemberRelationship[];
}

export interface ArtistPageUiState {
    artist: Artist | undefined;
    error: string | null;
    isFollowing: boolean;
    isFollowDisabled: boolean;
    isLoadingArtist: boolean;
    isLoadingReleases: boolean;
    isLoadingReleaseGroup: boolean;
    isFollowLoading: boolean;
    allReleaseGroups: ArtistReleaseGroup[];
    releaseGroupCovers: Record<string, string | null | undefined>;
    releaseSections: ReleaseGroupSection[];
    loadedItemsByType: Record<string, number>;
    profilePictures: Record<string, string | null | undefined>;
    pendingArtistImageIds: string[];
    pendingReleaseGroupCoverIds: string[];
}

interface ArtistPageHandlers {
    onToggleFollow: () => void;
    onArtistPressed: (artistId: string) => void;
    onRelationshipsExpanded: (artistIds: string[]) => void;
    onReleaseGroupPressed: (releaseGroup: ArtistReleaseGroup) => Promise<void>;
    onLoadMoreReleases: (sectionTitle: string) => void;
}

export interface ArtistPageController extends ArtistPageHandlers {
    state: ArtistPageUiState;
    onRetry: () => void;
    onClearError: () => void;
}

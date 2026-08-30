import type { Release } from '@pawify/shared';
import type {
    ArtistProfileImageLookup,
    ArtistProfileImageQueueOptions,
    ContractNamespace,
    ReleaseGroupPageEntry,
    ReleaseGroupReleasesPageEntry,
    TrackLyricsRequest,
} from '../../utils/types/taskTypes.js';

/**
 * Result of planning a background asset batch for one request. `resolved`
 * holds URL strings (or confirmed nulls) that are already known from cache;
 * `taskId` is null when nothing needs background work (v2 contract) and is
 * always a string when the full set was queued (v1 contract).
 */
export type AssetPlanResult = {
    taskId: string | null;
    resolved: Record<string, string | null>;
};

export type ArtistProfileImagePlanInput = {
    userId: string;
    scope: string;
    lookups: ArtistProfileImageLookup[];
    ttl: number | undefined;
};

export type ArtistReleaseGroupCoversPlanInput = {
    userId: string;
    artistId: string;
    pageEntries: ReleaseGroupPageEntry[];
    ttl: number | undefined;
};

export type ReleaseGroupReleaseCoversPlanInput = {
    userId: string;
    releaseGroupId: string;
    pageEntries: ReleaseGroupReleasesPageEntry[];
    ttl: number | undefined;
};

export type NewReleaseCoversPlanInput = {
    userId: string;
    pageEntries: ReleaseGroupReleasesPageEntry[];
};

export type ReleaseTrackLyricsPlanInput = {
    userId: string;
    release: Release;
    ttl: number | undefined;
};

export type ReleaseArtistProfileImagesPlanInput = {
    userId: string;
    release: Release;
    ttl: number | undefined;
};

export interface ArtistProfileImagesPlanner {
    planArtistProfileImages(input: ArtistProfileImagePlanInput): Promise<AssetPlanResult>;
}

export interface ArtistReleaseGroupCoversPlanner {
    planArtistReleaseGroupCovers(
        input: ArtistReleaseGroupCoversPlanInput,
    ): Promise<AssetPlanResult>;
}

export interface ReleaseGroupReleaseCoversPlanner {
    planReleaseGroupReleaseCovers(
        input: ReleaseGroupReleaseCoversPlanInput,
    ): Promise<AssetPlanResult>;
}

export interface NewReleaseCoversPlanner {
    planNewReleaseCovers(input: NewReleaseCoversPlanInput): Promise<AssetPlanResult>;
}

export interface ReleaseTrackLyricsPlanner {
    planReleaseTrackLyrics(input: ReleaseTrackLyricsPlanInput): Promise<AssetPlanResult>;
}

export interface ReleaseArtistProfileImagesPlanner {
    planReleaseArtistProfileImages(
        input: ReleaseArtistProfileImagesPlanInput,
    ): Promise<AssetPlanResult>;
}

/**
 * Combined planner covering every background asset flow. Injected into use
 * cases; a legacy (v1) or cache-first (v2) implementation is chosen at the
 * composition root.
 */
export interface BackgroundAssetPlanner
    extends
        ArtistProfileImagesPlanner,
        ArtistReleaseGroupCoversPlanner,
        ReleaseGroupReleaseCoversPlanner,
        NewReleaseCoversPlanner,
        ReleaseTrackLyricsPlanner,
        ReleaseArtistProfileImagesPlanner {}

/** Structural queue ports so planners stay decoupled from feature modules. */
export interface ArtistProfileImageQueuePort {
    queueArtistProfileImages(
        userId: string,
        scope: string,
        artistIds: string[],
        ttl: number | undefined,
        options?: ArtistProfileImageQueueOptions,
    ): string;
    queueArtistProfileImagesWithLookups(
        userId: string,
        scope: string,
        artistLookups: ArtistProfileImageLookup[],
        ttl: number | undefined,
        options?: ArtistProfileImageQueueOptions,
    ): string;
}

export type TaskQueueOptions = {
    contractNamespace?: ContractNamespace;
};

export interface ReleaseTaskQueuePort {
    addTaskUser(taskId: string, userId: string): void;
    queueArtistReleaseGroupCovers(
        userId: string,
        artistId: string,
        pageEntries: ReleaseGroupPageEntry[],
        ttl: number | undefined,
        options?: TaskQueueOptions,
    ): string;
    queueReleaseGroupReleaseCovers(
        userId: string,
        releaseGroupId: string,
        pageEntries: ReleaseGroupReleasesPageEntry[],
        ttl: number | undefined,
        options?: TaskQueueOptions,
    ): string;
    queueNewReleaseCovers(
        userId: string,
        pageEntries: ReleaseGroupReleasesPageEntry[],
        ttl: number | undefined,
        options?: TaskQueueOptions & { pendingEntries?: ReleaseGroupReleasesPageEntry[] },
    ): string;
    queueReleaseTrackLyrics(
        userId: string,
        release: Release,
        ttl: number | undefined,
        options?: TaskQueueOptions & { pendingTracks?: TrackLyricsRequest[] },
    ): string;
    queueReleaseArtistProfileImages(
        userId: string,
        release: Release,
        ttl: number | undefined,
        options?: TaskQueueOptions & { pendingArtistIds?: string[]; fullArtistIds?: string[] },
    ): string;
}

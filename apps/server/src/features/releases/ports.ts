import type { RequestDeduperPort } from '../../common/request/requestDeduper.js';
import type { BackgroundAssetPlanner } from '../../services/backgroundAssets/plannerTypes.js';
import type {
    NewRelease,
    Release,
    ReleaseGroupReleaseListItem,
} from '@pawify/shared';
import type { CachedArtistReleases } from '../../utils/types/cacheTypes.js';
import type {
    ContractNamespace,
    ReleaseGroupPageEntry,
    ReleaseGroupReleasesPageEntry,
    TrackLyricsRequest,
} from '../../utils/types/taskTypes.js';

export type NewReleasesById = {
    [releaseId: string]: NewRelease;
};

type NewReleasesSnapshot = {
    newReleasesMap: NewReleasesById;
    coverPageEntries: ReleaseGroupReleasesPageEntry[];
};

export interface ReleaseCatalogGateway {
    getArtistReleases(artistId: string, ttl: number | undefined): Promise<CachedArtistReleases>;
    getReleaseGroupReleases(
        releaseGroupId: string,
        ttl: number | undefined,
        onReleaseIdsPage: (
            releaseGroupId: string,
            releaseIds: string[],
            isLastPage: boolean,
        ) => Promise<void> | void,
    ): Promise<ReleaseGroupReleaseListItem[]>;
    getRelease(releaseId: string): Promise<Release | null>;
    releaseExists(releaseId: string): Promise<boolean>;
}

type TaskQueueOptions = {
    contractNamespace?: ContractNamespace;
};

export interface ReleaseTaskQueue {
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
        options?: TaskQueueOptions & {
            pendingEntries?: ReleaseGroupReleasesPageEntry[];
        },
    ): string;
    queueReleaseTrackLyrics(
        userId: string,
        release: Release,
        ttl: number | undefined,
        options?: TaskQueueOptions & {
            pendingTracks?: TrackLyricsRequest[];
        },
    ): string;
    queueReleaseArtistProfileImages(
        userId: string,
        release: Release,
        ttl: number | undefined,
        options?: TaskQueueOptions & {
            pendingArtistIds?: string[];
            fullArtistIds?: string[];
        },
    ): string;
}

export interface NewReleasesRepository {
    getNewReleasesSnapshot(userId: string): Promise<NewReleasesSnapshot>;
    deleteNewReleases(userId: string, releaseIds: string[]): Promise<void>;
}

export interface MissingReleaseCleanupRepository {
    removeMissingRelease(releaseId: string): Promise<{
        affectedUserIds: string[];
        removedFromNewReleasesUserIds: string[];
    }>;
}

export interface ReleaseNotifier {
    notifyReleasesChanged(userId: string, sourcePushToken?: string): Promise<void>;
}

type ReleaseSharedUseCaseDependencies = {
    missingReleaseCleanupRepository: MissingReleaseCleanupRepository;
    newReleasesRepository: NewReleasesRepository;
    releaseCatalogGateway: ReleaseCatalogGateway;
    releaseNotifier: ReleaseNotifier;
    releaseTaskQueue: ReleaseTaskQueue;
};

export type ReleaseReadUseCaseDependencies = ReleaseSharedUseCaseDependencies & {
    assetPlanner: BackgroundAssetPlanner;
    requestDeduper: RequestDeduperPort;
};

export type ReleaseWriteUseCaseDependencies = ReleaseSharedUseCaseDependencies;

export type ReleaseUseCaseDependencies = ReleaseReadUseCaseDependencies;

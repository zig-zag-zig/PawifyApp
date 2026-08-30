import type { RequestDeduperPort } from '../../common/request/requestDeduper.js';
import type { ArtistProfileImagesPlanner } from '../../services/backgroundAssets/plannerTypes.js';
import type { Artist, ArtistSearchResult } from '@pawify/shared';
import type { FollowedArtistSummary } from '../../utils/types/followedArtistTypes.js';
import type { ArtistProfileImageQueueOptions } from '../../utils/types/taskTypes.js';

type FollowedArtistsById = { [artistId: string]: FollowedArtistSummary };

interface ArtistDetailsGateway {
    getArtistDetails(userId: string, artistId: string): Promise<Artist | null>;
    getFollowedArtistSummary(
        userId: string,
        artistId: string,
    ): Promise<FollowedArtistSummary | null>;
}

interface ArtistFollowingRepository {
    getFollowingArtistIds(userId: string): Promise<string[]>;
    getFollowingState(userId: string): Promise<{
        artistIds: string[];
        artistSummaries: FollowedArtistsById;
    }>;
    saveFollowedArtist(
        userId: string,
        artistId: string,
        releaseIds: string[],
        artistSummary?: FollowedArtistSummary,
    ): Promise<void>;
    saveFollowingArtistSummaries(
        userId: string,
        artistSummaries: FollowedArtistSummary[],
    ): Promise<void>;
    deleteFollowedArtist(userId: string, artistId: string): Promise<void>;
}

interface ArtistReleaseCatalogGateway {
    getArtistReleaseIds(artistId: string, ttl: number | undefined): Promise<string[]>;
}

interface ArtistProfileImageQueue {
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
        artistLookups: { artistId: string; artistName?: string; discogsUrls?: string[] }[],
        ttl: number | undefined,
        options?: ArtistProfileImageQueueOptions,
    ): string;
}

interface ArtistSearchGateway {
    searchArtists(
        userId: string,
        query: string,
        offset: number,
        limit: number,
    ): Promise<ArtistSearchResult>;
}

interface FollowingNotifier {
    notifyFollowingChanged(userId: string, sourcePushToken?: string): Promise<void>;
}

type ArtistSharedUseCaseDependencies = {
    artistDetailsGateway: ArtistDetailsGateway;
    artistFollowingRepository: ArtistFollowingRepository;
    artistReleaseCatalogGateway: ArtistReleaseCatalogGateway;
    artistProfileImageQueue: ArtistProfileImageQueue;
    artistSearchGateway: ArtistSearchGateway;
    followingNotifier: FollowingNotifier;
};

export type ArtistReadUseCaseDependencies = ArtistSharedUseCaseDependencies & {
    assetPlanner: ArtistProfileImagesPlanner;
    requestDeduper: RequestDeduperPort;
};

export type ArtistWriteUseCaseDependencies = ArtistSharedUseCaseDependencies & {
    requestDeduper: RequestDeduperPort;
};

export type ArtistUseCaseDependencies = ArtistReadUseCaseDependencies;

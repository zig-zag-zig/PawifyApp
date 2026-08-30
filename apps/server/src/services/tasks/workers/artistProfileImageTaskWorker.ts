import { backgroundTaskWorkerConfig } from '../../../config/runtimeConfig.js';
import { createLogger } from '../../../common/logging/logger.js';
import { getExternalLinkUrlsByService } from '../../../utils/helpers/externalLinks.js';
import { getCacheKey } from '../../../utils/helpers/cacheHelpers.js';
import { mapWithConcurrency } from '../../../utils/helpers/promisePool.js';
import type {
    ArtistWithLegacyDiscogsUrls,
    CachedArtistDetails,
    CachedArtistImage,
} from '../../../utils/types/cacheTypes.js';
import type {
    ArtistProfileImageLookup,
    ArtistProfileImageTaskResult,
} from '../../../utils/types/taskTypes.js';
import { getCachedData, replaceCachedData } from '../../cacheService.js';
import { getDiscogsData, getDiscogsUrls } from '../../musicApi/discogsClient.js';
import { fetchMusicBrainzWithStatus } from '../../musicApi/musicBrainzClient.js';
import { isConfirmedMissingFetchFailure, isFetchFailureResult } from '../../musicApi/types.js';
import {
    hasLegacyArtistImageFields,
    mapArtistImageToState,
    normalizeArtistImageState,
    shouldRefetchArtistImageState,
} from '../backgroundTaskMappers.js';
import { syncArtistDetailsDiscogsUrls } from './artistProfileImageCacheSync.js';

const logger = createLogger('services.backgroundTasks.artistImages');

const ARTIST_PROFILE_IMAGE_REQUEST_CONCURRENCY =
    backgroundTaskWorkerConfig.artistProfileImageRequestConcurrency;

type ArtistProfileImageSource =
    | 'cache'
    | 'lookup'
    | 'musicbrainz_not_found'
    | 'musicbrainz_transient'
    | 'artist_name_missing'
    | 'discogs'
    | 'error';

type LookupDiscogsResultState = 'present' | 'null' | 'undefined';

/**
 * Per-artist resolution state shared between the orchestration loop and the
 * resolution steps. Kept as one mutable context so the null-resolution debug
 * log can report the same fields as before the step decomposition.
 */
type ArtistImageResolutionContext = {
    artistId: string;
    imageCacheKey: string;
    ttl: number | undefined;
    signal: AbortSignal | undefined;
    providedArtistName: string | undefined;
    providedDiscogsUrls: string[] | undefined;
    artistNameForLookup: string | undefined;
    discogsUrlsForLookup: string[] | undefined;
    cachedArtistDetailsForSync: CachedArtistDetails | null | undefined;
    cachedArtistDetailsHit: boolean;
    usedLookupBypass: boolean;
    lookupDiscogsResultState: LookupDiscogsResultState | undefined;
    lookupFallbackToMusicBrainz: boolean;
    usedMusicBrainzFetch: boolean;
    musicBrainzDiscogsUrlCount: number | undefined;
    artistDetailsDiscogsSyncUpdated: boolean;
    musicBrainzDurationMs: number | undefined;
    discogsDurationMs: number | undefined;
};

type CachedImageResolution =
    | { kind: 'cached'; state: CachedArtistImage; legacyRewriteRequired: boolean }
    | { kind: 'refetch' };

type LookupBypassResolution =
    { kind: 'not_attempted' } | { kind: 'resolved'; imageUrl: string } | { kind: 'fallthrough' };

type MusicBrainzResolution =
    | {
          kind: 'resolved';
          state: CachedArtistImage;
          source: 'musicbrainz_not_found' | 'musicbrainz_transient';
      }
    | { kind: 'name_missing'; state: CachedArtistImage }
    | { kind: 'artist_found'; artistName: string; discogsUrls: string[] };

export const dedupeArtistLookups = (
    artistLookups: ArtistProfileImageLookup[],
): ArtistProfileImageLookup[] =>
    Array.from(
        artistLookups
            .reduce((map, lookup) => {
                if (!lookup.artistId) {
                    return map;
                }

                const existing = map.get(lookup.artistId);
                map.set(lookup.artistId, {
                    artistId: lookup.artistId,
                    artistName: lookup.artistName ?? existing?.artistName,
                    discogsUrls: lookup.discogsUrls ?? existing?.discogsUrls,
                });
                return map;
            }, new Map<string, ArtistProfileImageLookup>())
            .values(),
    );

export const filterValidDiscogsUrls = (urls: unknown): string[] =>
    Array.isArray(urls)
        ? urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        : [];

const getProvidedArtistName = (lookup: ArtistProfileImageLookup): string | undefined => {
    if (typeof lookup.artistName !== 'string' || lookup.artistName.trim().length === 0) {
        return undefined;
    }

    return lookup.artistName.trim();
};

const getProvidedDiscogsUrls = (lookup: ArtistProfileImageLookup): string[] | undefined =>
    Array.isArray(lookup.discogsUrls) ? filterValidDiscogsUrls(lookup.discogsUrls) : undefined;

const createArtistImageResolutionContext = (
    lookup: ArtistProfileImageLookup,
    ttl: number | undefined,
    signal: AbortSignal | undefined,
): ArtistImageResolutionContext => {
    const providedArtistName = getProvidedArtistName(lookup);
    const providedDiscogsUrls = getProvidedDiscogsUrls(lookup);

    return {
        artistId: lookup.artistId,
        imageCacheKey: getCacheKey(lookup.artistId, 'artistImages'),
        ttl,
        signal,
        providedArtistName,
        providedDiscogsUrls,
        artistNameForLookup: providedArtistName,
        discogsUrlsForLookup: providedDiscogsUrls,
        cachedArtistDetailsForSync: undefined,
        cachedArtistDetailsHit: false,
        usedLookupBypass: false,
        lookupDiscogsResultState: undefined,
        lookupFallbackToMusicBrainz: false,
        usedMusicBrainzFetch: false,
        musicBrainzDiscogsUrlCount: undefined,
        artistDetailsDiscogsSyncUpdated: false,
        musicBrainzDurationMs: undefined,
        discogsDurationMs: undefined,
    };
};

const resolveCachedImage = async (
    context: ArtistImageResolutionContext,
): Promise<CachedImageResolution> => {
    const cachedImage = await getCachedData<CachedArtistImage>(context.imageCacheKey);

    if (cachedImage && !shouldRefetchArtistImageState(cachedImage)) {
        return {
            kind: 'cached',
            state: normalizeArtistImageState(cachedImage),
            legacyRewriteRequired: hasLegacyArtistImageFields(cachedImage),
        };
    }

    return { kind: 'refetch' };
};

const resolveArtistDetailsFromCache = async (
    context: ArtistImageResolutionContext,
): Promise<void> => {
    const cachedArtistDetails = await getCachedData<CachedArtistDetails>(
        getCacheKey(context.artistId, 'artistDetails'),
    );
    context.cachedArtistDetailsForSync = cachedArtistDetails;

    if (!cachedArtistDetails?.artist) {
        return;
    }

    context.cachedArtistDetailsHit = true;

    if (!context.artistNameForLookup && typeof cachedArtistDetails.artist.name === 'string') {
        const cachedName = cachedArtistDetails.artist.name.trim();
        if (cachedName.length > 0) {
            context.artistNameForLookup = cachedName;
        }
    }

    const legacyDiscogsUrls = (cachedArtistDetails.artist as ArtistWithLegacyDiscogsUrls)
        .discogsUrls;
    context.discogsUrlsForLookup = [
        ...getExternalLinkUrlsByService(cachedArtistDetails.artist.externalLinks, 'discogs'),
        ...filterValidDiscogsUrls(legacyDiscogsUrls),
    ];
};

const resolveViaLookupBypass = async (
    context: ArtistImageResolutionContext,
): Promise<LookupBypassResolution> => {
    if (
        !context.artistNameForLookup ||
        !Array.isArray(context.discogsUrlsForLookup) ||
        context.discogsUrlsForLookup.length === 0
    ) {
        return { kind: 'not_attempted' };
    }

    context.usedLookupBypass = true;
    const discogsStartedAt = Date.now();
    const discogsResult = await getDiscogsData(
        context.artistNameForLookup,
        context.discogsUrlsForLookup,
        context.signal,
    );
    context.discogsDurationMs = Date.now() - discogsStartedAt;
    context.lookupDiscogsResultState =
        discogsResult.image === undefined
            ? 'undefined'
            : discogsResult.image === null
              ? 'null'
              : 'present';

    if (typeof discogsResult.image === 'string' && discogsResult.image.trim().length > 0) {
        return { kind: 'resolved', imageUrl: discogsResult.image };
    }

    context.lookupFallbackToMusicBrainz = true;
    return { kind: 'fallthrough' };
};

const resolveViaMusicBrainz = async (
    context: ArtistImageResolutionContext,
): Promise<MusicBrainzResolution> => {
    const musicBrainzStartedAt = Date.now();
    context.usedMusicBrainzFetch = true;
    const artistData = await fetchMusicBrainzWithStatus(
        `/artist/${context.artistId}?fmt=json&inc=url-rels`,
        'GET',
        context.signal,
        'background',
    );
    context.musicBrainzDurationMs = Date.now() - musicBrainzStartedAt;

    if (isFetchFailureResult(artistData)) {
        if (isConfirmedMissingFetchFailure(artistData)) {
            return {
                kind: 'resolved',
                state: mapArtistImageToState(null),
                source: 'musicbrainz_not_found',
            };
        }

        return {
            kind: 'resolved',
            state: mapArtistImageToState(undefined),
            source: 'musicbrainz_transient',
        };
    }

    if (artistData === null || artistData === undefined) {
        return {
            kind: 'resolved',
            state: mapArtistImageToState(artistData === null ? null : undefined),
            source: artistData === null ? 'musicbrainz_not_found' : 'musicbrainz_transient',
        };
    }

    const artistRecord = artistData as { name?: unknown; relations?: any[] };
    const artistName = typeof artistRecord.name === 'string' ? artistRecord.name : undefined;
    const discogsUrls = getDiscogsUrls(artistRecord.relations);
    context.musicBrainzDiscogsUrlCount = discogsUrls.length;
    context.artistDetailsDiscogsSyncUpdated = await syncArtistDetailsDiscogsUrls(
        context.artistId,
        discogsUrls,
        context.cachedArtistDetailsForSync,
        context.ttl,
    );

    if (!artistName?.trim()) {
        return { kind: 'name_missing', state: mapArtistImageToState(null) };
    }

    return { kind: 'artist_found', artistName, discogsUrls };
};

const resolveViaDiscogs = async (
    context: ArtistImageResolutionContext,
    artistName: string,
    discogsUrls: string[],
): Promise<{ imageUrl: string | null | undefined }> => {
    const discogsStartedAt = Date.now();
    const discogsResult = await getDiscogsData(artistName, discogsUrls, context.signal);
    context.discogsDurationMs = Date.now() - discogsStartedAt;
    return { imageUrl: discogsResult.image };
};

export const fetchAndUpsertArtistProfileImages = async (
    _userId: string,
    artistLookups: ArtistProfileImageLookup[],
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<ArtistProfileImageTaskResult> => {
    const uniqueArtistLookups = dedupeArtistLookups(artistLookups);
    const artists: { [artistId: string]: string | null | undefined } = {};
    const batchStartedAt = Date.now();
    let cacheHitCount = 0;
    let refetchCount = 0;
    let legacyRewriteCount = 0;
    let musicBrainzNotFoundCount = 0;
    let missingArtistNameCount = 0;
    let discogsImageFoundCount = 0;
    let discogsImageMissingCount = 0;
    let discogsImageTransientCount = 0;
    let lookupBypassMusicBrainzCount = 0;

    logger.debug('artist profile image batch started', {
        artistCount: uniqueArtistLookups.length,
        ttlHours: ttl ?? null,
    });

    await mapWithConcurrency(
        uniqueArtistLookups,
        ARTIST_PROFILE_IMAGE_REQUEST_CONCURRENCY,
        async (lookup) => {
            const artistStartedAt = Date.now();
            const artistId = lookup.artistId;
            const context = createArtistImageResolutionContext(lookup, ttl, signal);
            let source: ArtistProfileImageSource = 'cache';

            try {
                const cachedImage = await resolveCachedImage(context);
                if (cachedImage.kind === 'cached') {
                    cacheHitCount += 1;
                    if (cachedImage.legacyRewriteRequired) {
                        legacyRewriteCount += 1;
                        await replaceCachedData(context.imageCacheKey, cachedImage.state, ttl);
                    }

                    artists[artistId] = cachedImage.state.url;
                    return;
                }

                refetchCount += 1;

                if (context.discogsUrlsForLookup === undefined) {
                    await resolveArtistDetailsFromCache(context);
                }

                const lookupBypass = await resolveViaLookupBypass(context);
                if (lookupBypass.kind === 'resolved') {
                    lookupBypassMusicBrainzCount += 1;
                    source = 'lookup';
                    discogsImageFoundCount += 1;
                    const state = mapArtistImageToState(lookupBypass.imageUrl);
                    await replaceCachedData(context.imageCacheKey, state, ttl);
                    artists[artistId] = state.url;
                    return;
                }
                if (lookupBypass.kind === 'fallthrough') {
                    lookupBypassMusicBrainzCount += 1;
                }

                const musicBrainz = await resolveViaMusicBrainz(context);
                if (musicBrainz.kind === 'resolved') {
                    source = musicBrainz.source;
                    if (musicBrainz.source === 'musicbrainz_not_found') {
                        musicBrainzNotFoundCount += 1;
                    }
                    await replaceCachedData(context.imageCacheKey, musicBrainz.state, ttl);
                    artists[artistId] = musicBrainz.state.url;
                    return;
                }
                if (musicBrainz.kind === 'name_missing') {
                    source = 'artist_name_missing';
                    missingArtistNameCount += 1;
                    await replaceCachedData(context.imageCacheKey, musicBrainz.state, ttl);
                    artists[artistId] = musicBrainz.state.url;
                    return;
                }

                source = 'discogs';
                const discogs = await resolveViaDiscogs(
                    context,
                    musicBrainz.artistName,
                    musicBrainz.discogsUrls,
                );
                const state = mapArtistImageToState(discogs.imageUrl);
                await replaceCachedData(context.imageCacheKey, state, ttl);
                artists[artistId] = state.url;

                if (typeof discogs.imageUrl === 'string' && discogs.imageUrl.trim().length > 0) {
                    discogsImageFoundCount += 1;
                } else if (discogs.imageUrl === null) {
                    discogsImageMissingCount += 1;
                } else {
                    discogsImageTransientCount += 1;
                }
            } catch (error) {
                source = 'error';
                throw error;
            } finally {
                if (artists[artistId] === null) {
                    logger.debug('artist profile image resolved to null', {
                        artistId,
                        source,
                        providedArtistName: context.providedArtistName !== undefined,
                        providedDiscogsUrlCount: context.providedDiscogsUrls?.length ?? 0,
                        cachedArtistDetailsHit: context.cachedArtistDetailsHit,
                        lookupDiscogsUrlCount: context.discogsUrlsForLookup?.length ?? 0,
                        usedLookupBypass: context.usedLookupBypass,
                        lookupDiscogsResultState: context.lookupDiscogsResultState,
                        lookupFallbackToMusicBrainz: context.lookupFallbackToMusicBrainz,
                        usedMusicBrainzFetch: context.usedMusicBrainzFetch,
                        musicBrainzDiscogsUrlCount: context.musicBrainzDiscogsUrlCount ?? 0,
                        artistDetailsDiscogsSyncUpdated: context.artistDetailsDiscogsSyncUpdated,
                        musicBrainzDurationMs: context.musicBrainzDurationMs,
                        discogsDurationMs: context.discogsDurationMs,
                        durationMs: Date.now() - artistStartedAt,
                    });
                }
            }
        },
    );

    logger.debug('artist profile image batch completed', {
        artistCount: uniqueArtistLookups.length,
        cacheHitCount,
        refetchCount,
        legacyRewriteCount,
        musicBrainzNotFoundCount,
        missingArtistNameCount,
        discogsImageFoundCount,
        discogsImageMissingCount,
        discogsImageTransientCount,
        lookupBypassMusicBrainzCount,
        durationMs: Date.now() - batchStartedAt,
    });

    return { artists };
};

import { backgroundTaskWorkerConfig } from '../../../config/runtimeConfig.js';
import { createLogger } from '../../../common/logging/logger.js';
import {
    getExternalLinkUrlsByService,
    mapRelationsToExternalLinks,
} from '../../../utils/helpers/externalLinks.js';
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
import { resolveArtistImage } from '../../musicApi/artistImageSources.js';
import { fetchMusicBrainzWithStatus } from '../../musicApi/musicBrainzClient.js';
import { isConfirmedMissingFetchFailure, isFetchFailureResult } from '../../musicApi/types.js';
import type { ArtistImageProvider } from '../../musicApi/types.js';
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
    | 'deezer'
    | 'tidal'
    | 'discogs'
    | 'error';

type LookupProviderResultState = 'present' | 'null' | 'undefined';

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
    providedDeezerUrls: string[] | undefined;
    providedTidalUrls: string[] | undefined;
    artistNameForLookup: string | undefined;
    discogsUrlsForLookup: string[] | undefined;
    deezerUrlsForLookup: string[] | undefined;
    tidalUrlsForLookup: string[] | undefined;
    cachedArtistDetailsForSync: CachedArtistDetails | null | undefined;
    cachedArtistDetailsHit: boolean;
    usedLookupBypass: boolean;
    lookupProviderResultState: LookupProviderResultState | undefined;
    lookupFallbackToMusicBrainz: boolean;
    /** Providers the bypass pass already proved have no image for this artist. */
    bypassConfirmedMisses: Set<ArtistImageProvider>;
    usedMusicBrainzFetch: boolean;
    musicBrainzDiscogsUrlCount: number | undefined;
    musicBrainzDeezerUrlCount: number | undefined;
    musicBrainzTidalUrlCount: number | undefined;
    artistDetailsDiscogsSyncUpdated: boolean;
    musicBrainzDurationMs: number | undefined;
    providerDurationMs: number | undefined;
};

type CachedImageResolution =
    | { kind: 'cached'; state: CachedArtistImage; legacyRewriteRequired: boolean }
    | { kind: 'refetch' };

type LookupBypassResolution =
    | { kind: 'not_attempted' }
    | { kind: 'resolved'; imageUrl: string; source: ArtistImageProvider | undefined }
    | { kind: 'fallthrough' };

type MusicBrainzResolution =
    | {
          kind: 'resolved';
          state: CachedArtistImage;
          source: 'musicbrainz_not_found' | 'musicbrainz_transient';
      }
    | {
          kind: 'name_missing';
          state: CachedArtistImage;
          deezerUrls: string[];
          tidalUrls: string[];
      }
    | {
          kind: 'artist_found';
          artistName: string;
          discogsUrls: string[];
          deezerUrls: string[];
          tidalUrls: string[];
      };

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
                    deezerUrls: lookup.deezerUrls ?? existing?.deezerUrls,
                    tidalUrls: lookup.tidalUrls ?? existing?.tidalUrls,
                });
                return map;
            }, new Map<string, ArtistProfileImageLookup>())
            .values(),
    );

export const filterValidProviderUrls = (urls: unknown): string[] =>
    Array.isArray(urls)
        ? urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        : [];

const hasUrls = (urls: string[] | undefined): urls is string[] =>
    Array.isArray(urls) && urls.length > 0;

const getProvidedArtistName = (lookup: ArtistProfileImageLookup): string | undefined => {
    if (typeof lookup.artistName !== 'string' || lookup.artistName.trim().length === 0) {
        return undefined;
    }

    return lookup.artistName.trim();
};

const getProvidedUrls = (urls: string[] | undefined): string[] | undefined =>
    Array.isArray(urls) ? filterValidProviderUrls(urls) : undefined;

const createArtistImageResolutionContext = (
    lookup: ArtistProfileImageLookup,
    ttl: number | undefined,
    signal: AbortSignal | undefined,
): ArtistImageResolutionContext => {
    const providedArtistName = getProvidedArtistName(lookup);
    const providedDiscogsUrls = getProvidedUrls(lookup.discogsUrls);
    const providedDeezerUrls = getProvidedUrls(lookup.deezerUrls);
    const providedTidalUrls = getProvidedUrls(lookup.tidalUrls);

    return {
        artistId: lookup.artistId,
        imageCacheKey: getCacheKey(lookup.artistId, 'artistImages'),
        ttl,
        signal,
        providedArtistName,
        providedDiscogsUrls,
        providedDeezerUrls,
        providedTidalUrls,
        artistNameForLookup: providedArtistName,
        discogsUrlsForLookup: providedDiscogsUrls,
        deezerUrlsForLookup: providedDeezerUrls,
        tidalUrlsForLookup: providedTidalUrls,
        cachedArtistDetailsForSync: undefined,
        cachedArtistDetailsHit: false,
        usedLookupBypass: false,
        lookupProviderResultState: undefined,
        lookupFallbackToMusicBrainz: false,
        bypassConfirmedMisses: new Set(),
        usedMusicBrainzFetch: false,
        musicBrainzDiscogsUrlCount: undefined,
        musicBrainzDeezerUrlCount: undefined,
        musicBrainzTidalUrlCount: undefined,
        artistDetailsDiscogsSyncUpdated: false,
        musicBrainzDurationMs: undefined,
        providerDurationMs: undefined,
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

    const externalLinks = cachedArtistDetails.artist.externalLinks;
    const legacyDiscogsUrls = (cachedArtistDetails.artist as ArtistWithLegacyDiscogsUrls)
        .discogsUrls;
    // Merge rather than overwrite: urls the caller already supplied win, and the
    // cache only fills the gaps. Deezer and Tidal links live in the cached
    // external links, which lets the provider chain resolve without a
    // MusicBrainz round trip even when the caller only knew about Discogs.
    context.discogsUrlsForLookup = context.discogsUrlsForLookup ?? [
        ...getExternalLinkUrlsByService(externalLinks, 'discogs'),
        ...filterValidProviderUrls(legacyDiscogsUrls),
    ];
    context.deezerUrlsForLookup =
        context.deezerUrlsForLookup ?? getExternalLinkUrlsByService(externalLinks, 'deezer');
    context.tidalUrlsForLookup =
        context.tidalUrlsForLookup ?? getExternalLinkUrlsByService(externalLinks, 'tidal');
};

/**
 * Tries the provider chain with urls the caller already supplied, which avoids a
 * MusicBrainz round trip entirely when one of them has the image.
 */
const resolveViaLookupBypass = async (
    context: ArtistImageResolutionContext,
): Promise<LookupBypassResolution> => {
    // Discogs disambiguates same-named artists by name, so only attempt it when
    // a name is known. Deezer and Tidal resolve purely by id.
    const discogsUrls =
        hasUrls(context.discogsUrlsForLookup) && context.artistNameForLookup
            ? context.discogsUrlsForLookup
            : undefined;

    if (
        !hasUrls(context.deezerUrlsForLookup) &&
        !hasUrls(context.tidalUrlsForLookup) &&
        !hasUrls(discogsUrls)
    ) {
        return { kind: 'not_attempted' };
    }

    context.usedLookupBypass = true;
    const startedAt = Date.now();
    const resolution = await resolveArtistImage(
        {
            artistName: context.artistNameForLookup,
            deezerUrls: context.deezerUrlsForLookup,
            tidalUrls: context.tidalUrlsForLookup,
            discogsUrls,
        },
        context.signal,
    );
    context.providerDurationMs = (context.providerDurationMs ?? 0) + (Date.now() - startedAt);
    context.bypassConfirmedMisses = new Set(resolution.confirmedMisses);
    context.lookupProviderResultState =
        resolution.image === undefined
            ? 'undefined'
            : resolution.image === null
              ? 'null'
              : 'present';

    if (typeof resolution.image === 'string' && resolution.image.trim().length > 0) {
        return { kind: 'resolved', imageUrl: resolution.image, source: resolution.source };
    }

    context.lookupFallbackToMusicBrainz = true;
    return { kind: 'fallthrough' };
};

/**
 * Moves urls from ended MusicBrainz relations to the end of the list.
 *
 * Relations carry an `ended` flag, but the provider url itself does not, so the
 * flag is recovered here before the urls reach the provider clients. Ordering is
 * stable, so relations MusicBrainz did not mark keep their original order.
 */
export const preferActiveRelations = (urls: string[], relations: any[] | undefined): string[] => {
    if (urls.length < 2 || !relations?.length) {
        return urls;
    }

    const endedUrls = new Set<string>();
    for (const relation of relations) {
        if (relation?.ended !== true) {
            continue;
        }

        const relationUrl = relation.url;
        const entries = Array.isArray(relationUrl) ? relationUrl : [relationUrl];
        for (const entry of entries) {
            const resource = typeof entry === 'string' ? entry : entry?.resource;
            if (typeof resource !== 'string') {
                continue;
            }

            try {
                endedUrls.add(new URL(resource).toString());
            } catch {
                // Unparseable resources are left to the provider clients.
            }
        }
    }

    if (endedUrls.size === 0) {
        return urls;
    }

    return [...urls].sort(
        (left, right) => Number(endedUrls.has(left)) - Number(endedUrls.has(right)),
    );
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
    // MusicBrainz files Deezer and Tidal links under the generic `free
    // streaming` / `streaming` relation types, so the provider is identified by
    // url host rather than by relation type.
    const externalLinks = mapRelationsToExternalLinks(artistRecord.relations);
    // An ended streaming link is usually a stale profile, so put those last
    // before the provider clients start scoring candidates.
    const discogsUrls = preferActiveRelations(
        getExternalLinkUrlsByService(externalLinks, 'discogs'),
        artistRecord.relations,
    );
    const deezerUrls = preferActiveRelations(
        getExternalLinkUrlsByService(externalLinks, 'deezer'),
        artistRecord.relations,
    );
    const tidalUrls = preferActiveRelations(
        getExternalLinkUrlsByService(externalLinks, 'tidal'),
        artistRecord.relations,
    );
    context.musicBrainzDiscogsUrlCount = discogsUrls.length;
    context.musicBrainzDeezerUrlCount = deezerUrls.length;
    context.musicBrainzTidalUrlCount = tidalUrls.length;
    context.artistDetailsDiscogsSyncUpdated = await syncArtistDetailsDiscogsUrls(
        context.artistId,
        discogsUrls,
        context.cachedArtistDetailsForSync,
        context.ttl,
    );

    if (!artistName?.trim()) {
        return {
            kind: 'name_missing',
            state: mapArtistImageToState(null),
            deezerUrls,
            tidalUrls,
        };
    }

    return { kind: 'artist_found', artistName, discogsUrls, deezerUrls, tidalUrls };
};

const resolveViaProviders = async (
    context: ArtistImageResolutionContext,
    artistName: string,
    urls: { deezerUrls: string[]; tidalUrls: string[]; discogsUrls: string[] },
): Promise<{ imageUrl: string | null | undefined; source: ArtistImageProvider | undefined }> => {
    const startedAt = Date.now();
    const resolution = await resolveArtistImage(
        {
            artistName,
            deezerUrls: urls.deezerUrls,
            tidalUrls: urls.tidalUrls,
            discogsUrls: urls.discogsUrls,
            // Do not re-ask a provider the bypass pass already got a definitive
            // "no image" from. A transient failure is deliberately not skipped,
            // so it is retried once the fresh MusicBrainz urls are known.
            skipProviders: context.bypassConfirmedMisses,
        },
        context.signal,
    );
    // Accumulates: an artist can run the chain twice (bypass, then again with
    // freshly fetched MusicBrainz urls).
    context.providerDurationMs = (context.providerDurationMs ?? 0) + (Date.now() - startedAt);
    return { imageUrl: resolution.image, source: resolution.source };
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
    let imageFoundCount = 0;
    let imageMissingCount = 0;
    let imageTransientCount = 0;
    let lookupBypassMusicBrainzCount = 0;
    const imageSourceCounts: Record<ArtistImageProvider, number> = {
        deezer: 0,
        tidal: 0,
        discogs: 0,
    };

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

            const recordResolvedImage = async (
                imageUrl: string,
                imageSource: ArtistImageProvider | undefined,
                resolvedSource: ArtistProfileImageSource,
            ) => {
                source = resolvedSource;
                imageFoundCount += 1;
                if (imageSource) {
                    imageSourceCounts[imageSource] += 1;
                }

                const state = mapArtistImageToState(imageUrl);
                await replaceCachedData(context.imageCacheKey, state, ttl);
                artists[artistId] = state.url;

                // Which provider is carrying the load is not stored in the cache;
                // this log line is the only signal that, for example, the Tidal
                // community token has stopped working.
                logger.debug('artist profile image resolved', {
                    artistId,
                    imageSource: imageSource ?? 'unknown',
                    durationMs: Date.now() - artistStartedAt,
                });
            };

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

                if (
                    context.discogsUrlsForLookup === undefined ||
                    context.deezerUrlsForLookup === undefined ||
                    context.tidalUrlsForLookup === undefined
                ) {
                    await resolveArtistDetailsFromCache(context);
                }

                const lookupBypass = await resolveViaLookupBypass(context);
                if (lookupBypass.kind === 'resolved') {
                    lookupBypassMusicBrainzCount += 1;
                    await recordResolvedImage(lookupBypass.imageUrl, lookupBypass.source, 'lookup');
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
                    missingArtistNameCount += 1;

                    // Deezer and Tidal resolve by id alone, so a missing artist
                    // name only rules out Discogs.
                    const providers = await resolveViaProviders(context, '', {
                        deezerUrls: musicBrainz.deezerUrls,
                        tidalUrls: musicBrainz.tidalUrls,
                        discogsUrls: [],
                    });

                    if (
                        typeof providers.imageUrl === 'string' &&
                        providers.imageUrl.trim().length > 0
                    ) {
                        await recordResolvedImage(
                            providers.imageUrl,
                            providers.source,
                            providers.source ?? 'deezer',
                        );
                        return;
                    }

                    source = 'artist_name_missing';
                    await replaceCachedData(context.imageCacheKey, musicBrainz.state, ttl);
                    artists[artistId] = musicBrainz.state.url;
                    return;
                }

                const providers = await resolveViaProviders(context, musicBrainz.artistName, {
                    deezerUrls: musicBrainz.deezerUrls,
                    tidalUrls: musicBrainz.tidalUrls,
                    discogsUrls: musicBrainz.discogsUrls,
                });

                if (
                    typeof providers.imageUrl === 'string' &&
                    providers.imageUrl.trim().length > 0
                ) {
                    await recordResolvedImage(
                        providers.imageUrl,
                        providers.source,
                        providers.source ?? 'discogs',
                    );
                    return;
                }

                source = 'discogs';
                const state = mapArtistImageToState(providers.imageUrl);
                await replaceCachedData(context.imageCacheKey, state, ttl);
                artists[artistId] = state.url;

                if (providers.imageUrl === null) {
                    imageMissingCount += 1;
                } else {
                    imageTransientCount += 1;
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
                        providedDeezerUrlCount: context.providedDeezerUrls?.length ?? 0,
                        providedTidalUrlCount: context.providedTidalUrls?.length ?? 0,
                        cachedArtistDetailsHit: context.cachedArtistDetailsHit,
                        lookupDiscogsUrlCount: context.discogsUrlsForLookup?.length ?? 0,
                        lookupDeezerUrlCount: context.deezerUrlsForLookup?.length ?? 0,
                        lookupTidalUrlCount: context.tidalUrlsForLookup?.length ?? 0,
                        usedLookupBypass: context.usedLookupBypass,
                        lookupProviderResultState: context.lookupProviderResultState,
                        lookupFallbackToMusicBrainz: context.lookupFallbackToMusicBrainz,
                        usedMusicBrainzFetch: context.usedMusicBrainzFetch,
                        musicBrainzDiscogsUrlCount: context.musicBrainzDiscogsUrlCount ?? 0,
                        musicBrainzDeezerUrlCount: context.musicBrainzDeezerUrlCount ?? 0,
                        musicBrainzTidalUrlCount: context.musicBrainzTidalUrlCount ?? 0,
                        artistDetailsDiscogsSyncUpdated: context.artistDetailsDiscogsSyncUpdated,
                        musicBrainzDurationMs: context.musicBrainzDurationMs,
                        providerDurationMs: context.providerDurationMs,
                        durationMs: Date.now() - artistStartedAt,
                    });
                }
            }
        },
    );

    // Info, not debug: production runs at info level, and the per-provider counts
    // are the only always-on signal that a provider has stopped contributing (a
    // revoked Tidal token shows up here as tidalImageFoundCount dropping to 0).
    logger.info('artist profile image batch completed', {
        artistCount: uniqueArtistLookups.length,
        cacheHitCount,
        refetchCount,
        legacyRewriteCount,
        musicBrainzNotFoundCount,
        missingArtistNameCount,
        imageFoundCount,
        imageMissingCount,
        imageTransientCount,
        deezerImageFoundCount: imageSourceCounts.deezer,
        tidalImageFoundCount: imageSourceCounts.tidal,
        discogsImageFoundCount: imageSourceCounts.discogs,
        lookupBypassMusicBrainzCount,
        durationMs: Date.now() - batchStartedAt,
    });

    return { artists };
};

import { getDeezerArtistImage } from './deezerClient.js';
import { getDiscogsData } from './discogsClient.js';
import { getTidalArtistImage } from './tidalClient.js';
import { lookupMirrorImage } from './mirrorEntityImages.js';
import { scheduleEntityImageRevalidation, settleEntityImageMiss } from './entityImageFreshness.js';
import type { ArtistImageProvider, ProviderValueState } from './types.js';

/**
 * Resolution order for an artist profile image. Deezer first: it needs no
 * credentials and almost always has artwork. Tidal second, Discogs last because
 * it is the slowest and the most rate-limited.
 */
export const ARTIST_IMAGE_PROVIDER_ORDER: readonly ArtistImageProvider[] = [
    'deezer',
    'tidal',
    'discogs',
];

export type ArtistImageProviderLookup = {
    /** Mirror key for the artist; the image-state tables are read by it. */
    artistId?: string;
    /**
     * Ignore the mirror row and always walk the providers.
     *
     * Background revalidation and the broken-image repair path set this: they are
     * called precisely because the stored row is stale or dead, so reading it again
     * would hand the same answer back.
     */
    bypassMirror?: boolean;
    /** Used only for Discogs, to pick between several same-named artists. */
    artistName?: string;
    deezerUrls?: string[];
    tidalUrls?: string[];
    discogsUrls?: string[];
    /**
     * Providers already proven to have no image for this artist in an earlier
     * pass, so re-asking them would be a wasted call.
     */
    skipProviders?: ReadonlySet<ArtistImageProvider>;
};

export type ArtistImageResolution = {
    image: ProviderValueState;
    /** Which provider produced the image, when one was found. */
    source: ArtistImageProvider | undefined;
    /** Providers that answered and definitively have no image. */
    confirmedMisses: ArtistImageProvider[];
    /** Providers that failed transiently and are worth asking again later. */
    transientFailures: ArtistImageProvider[];
};

const hasUrls = (urls: string[] | undefined): urls is string[] =>
    Array.isArray(urls) && urls.length > 0;

const hasImage = (image: ProviderValueState): image is string =>
    typeof image === 'string' && image.trim().length > 0;

/**
 * Artwork the mirror already answered for this artist, or null to run the chain.
 *
 * Cover Art Archive is deliberately not a possible answer here: it only holds
 * release artwork, never artist portraits, so a mirrored artist row is always one
 * of the three streaming sources.
 */
const resolveMirroredArtistImage = (
    lookup: ArtistImageProviderLookup,
): ArtistImageResolution | null => {
    const mirrored = lookupMirrorImage('artist', lookup.artistId);

    if (mirrored.kind === 'resolved') {
        if (
            mirrored.service !== 'deezer' &&
            mirrored.service !== 'tidal' &&
            mirrored.service !== 'discogs'
        ) {
            return null;
        }
        if (mirrored.freshness.revalidate && lookup.artistId) {
            const artistId = lookup.artistId;
            scheduleEntityImageRevalidation('artist', artistId, async () => {
                const refreshed = await resolveArtistImage({
                    ...lookup,
                    skipProviders: undefined,
                    bypassMirror: true,
                });
                return refreshed.image;
            });
        }
        return {
            image: mirrored.url,
            source: mirrored.service,
            confirmedMisses: [],
            transientFailures: [],
        };
    }

    if (mirrored.kind === 'missing') {
        if (mirrored.freshness.revalidate && lookup.artistId) {
            const artistId = lookup.artistId;
            const { settlePermanent } = mirrored.freshness;
            scheduleEntityImageRevalidation('artist', artistId, async () => {
                const refreshed = await resolveArtistImage({
                    ...lookup,
                    skipProviders: undefined,
                    bypassMirror: true,
                });
                if (
                    settlePermanent &&
                    (refreshed.image === null || refreshed.image === undefined)
                ) {
                    settleEntityImageMiss('artist', artistId);
                }
                return refreshed.image;
            });
        }
        return {
            image: null,
            source: undefined,
            confirmedMisses: [...ARTIST_IMAGE_PROVIDER_ORDER],
            transientFailures: [],
        };
    }

    return null;
};

/**
 * Walks the provider chain and stops at the first usable image.
 *
 * Combines outcomes using the repo-wide tri-state: a transient failure anywhere
 * makes the whole lookup transient (retried after the cache cooldown) unless a
 * later provider found an image, while every provider answering "definitely no
 * image" is a confirmed miss that is cached and not retried until it expires.
 *
 * Abort errors propagate; nothing else throws, so one artist can never fail the
 * surrounding batch.
 */
export const resolveArtistImage = async (
    lookup: ArtistImageProviderLookup,
    signal?: AbortSignal,
): Promise<ArtistImageResolution> => {
    // A mirrored hit is the answer itself: these are the same providers, already
    // asked once by the mirror builder, so no request is repeated here. Revalidation
    // and repair pass `bypassMirror` so they interrogate the providers instead.
    const mirrored = lookup.bypassMirror ? null : resolveMirroredArtistImage(lookup);
    if (mirrored) {
        return mirrored;
    }

    const confirmedMisses: ArtistImageProvider[] = [];
    const transientFailures: ArtistImageProvider[] = [];
    const skipped = lookup.skipProviders;

    const record = (provider: ArtistImageProvider, image: ProviderValueState) => {
        if (image === undefined) {
            transientFailures.push(provider);
        } else {
            confirmedMisses.push(provider);
        }
    };

    const shouldAttempt = (provider: ArtistImageProvider, urls: string[] | undefined) =>
        hasUrls(urls) && !skipped?.has(provider);

    if (shouldAttempt('deezer', lookup.deezerUrls)) {
        const image = await getDeezerArtistImage(lookup.deezerUrls!, {
            artistName: lookup.artistName,
            signal,
        });
        if (hasImage(image)) {
            return { image, source: 'deezer', confirmedMisses, transientFailures };
        }
        record('deezer', image);
    }

    if (shouldAttempt('tidal', lookup.tidalUrls)) {
        const image = await getTidalArtistImage(lookup.tidalUrls!, {
            artistName: lookup.artistName,
            signal,
        });
        if (hasImage(image)) {
            return { image, source: 'tidal', confirmedMisses, transientFailures };
        }
        record('tidal', image);
    }

    if (shouldAttempt('discogs', lookup.discogsUrls)) {
        const { image } = await getDiscogsData(
            lookup.artistName ?? '',
            lookup.discogsUrls!,
            signal,
        );
        if (hasImage(image)) {
            return { image, source: 'discogs', confirmedMisses, transientFailures };
        }
        record('discogs', image);
    }

    return {
        image: transientFailures.length > 0 ? undefined : null,
        source: undefined,
        confirmedMisses,
        transientFailures,
    };
};

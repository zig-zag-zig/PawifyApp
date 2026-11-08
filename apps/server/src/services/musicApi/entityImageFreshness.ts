import { createLogger } from '../../common/logging/logger.js';
import { isMusicDbEnabled } from '../../infrastructure/musicDb/musicDbClient.js';
import {
    readEntityImage,
    toEntityImageToken,
    writeEntityImage,
    type EntityImageEntityType,
} from '../../infrastructure/musicDb/entityImageRepository.js';

const logger = createLogger('services.musicApi.entityImageFreshness');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long a resolved artist portrait is served before a background refresh.
 *
 * Artists replace their promo photo on Deezer/Tidal/Discogs, and the replacement
 * gets a new CDN token, so unlike release artwork this is not permanent.
 */
export const ARTIST_IMAGE_MAX_AGE_MS = 60 * DAY_MS;

/**
 * How long a confirmed miss that still carries provider links is trusted.
 *
 * Streaming providers often add artwork for a brand-new release hours after it
 * appears, so a miss is re-checked once a day. Re-checks are eventual: the request
 * that notices the stale row still answers with the stored value.
 */
export const CONFIRMED_MISS_MAX_AGE_MS = DAY_MS;

/** A miss re-checked this long after the first attempt is treated as permanent. */
const PERMANENT_AFTER_MS = 7 * DAY_MS;

/**
 * Releases and release groups are permanent once resolved: an edition's cover does
 * not change, and `mbforge sync` overwrites the row when MusicBrainz itself changes.
 */
const isPermanentService = (service: string): boolean =>
    service === 'caa_rel' || service === 'caa_rg' || service === 'deezer' || service === 'tidal';

export type EntityImageFreshness = {
    /** Serve this value on the current request, without waiting for any lookup. */
    immediate: boolean;
    /** Queue a detached refresh after answering. */
    revalidate: boolean;
    /** Write `fetched_at = 0` after a thrice-stale miss so it is never polled again. */
    settlePermanent: boolean;
};

export const resolveEntityImageFreshness = (
    entityType: EntityImageEntityType,
    record: { service: string; fetchedAt: number } | null,
    now: number = Date.now(),
): EntityImageFreshness | null => {
    if (!record) {
        return null;
    }

    // `pending` means the entity was queued for the worker but not answered yet, so
    // it must go through the live path like an entity with no row at all.
    if (record.service === 'pending') {
        return null;
    }

    if (record.service === 'none') {
        // `fetched_at = 0` is derived offline from the dump (no CAA, no streaming
        // links). Nothing will ever answer it until `mbforge sync` sees a MusicBrainz
        // edit, so it is permanent.
        if (record.fetchedAt === 0) {
            return { immediate: true, revalidate: false, settlePermanent: false };
        }

        const age = now - record.fetchedAt * 1000;
        if (age < CONFIRMED_MISS_MAX_AGE_MS) {
            return { immediate: true, revalidate: false, settlePermanent: false };
        }

        return {
            immediate: true,
            revalidate: true,
            settlePermanent: age > PERMANENT_AFTER_MS,
        };
    }

    // Release and release-group artwork is permanent: the same `deezer`/`tidal`
    // service ids mean "artist portrait" for an artist row, which does age.
    if (entityType !== 'artist' && isPermanentService(record.service)) {
        return { immediate: true, revalidate: false, settlePermanent: false };
    }

    const age = now - record.fetchedAt * 1000;
    if (record.fetchedAt === 0 || age <= ARTIST_IMAGE_MAX_AGE_MS) {
        return { immediate: true, revalidate: false, settlePermanent: false };
    }

    return { immediate: true, revalidate: true, settlePermanent: false };
};

const inFlight = new Set<string>();

/**
 * Runs a detached refresh at most once per entity at a time.
 *
 * Errors are swallowed on purpose: a revalidation is an optimisation, and a provider
 * hiccup must never surface as a failed user request.
 */
export const scheduleEntityImageRevalidation = (
    entityType: EntityImageEntityType,
    entityId: string,
    resolve: () => Promise<string | null | undefined>,
): void => {
    if (!isMusicDbEnabled()) {
        return;
    }

    const key = `${entityType}:${entityId}`;
    if (inFlight.has(key)) {
        return;
    }
    inFlight.add(key);

    void (async () => {
        try {
            const url = await resolve();
            const token = toEntityImageToken(url, entityId);
            if (!token) {
                return;
            }
            writeEntityImage({
                entityType,
                entityId,
                service: token.service,
                token: token.token,
            });
            logger.debug('entity image revalidated', { entityType, entityId });
        } catch (error) {
            logger.debug('entity image revalidation failed', {
                entityType,
                entityId,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            inFlight.delete(key);
        }
    })();
};

/** Marks a re-checked miss as permanent so it is never polled again. */
export const settleEntityImageMiss = (
    entityType: EntityImageEntityType,
    entityId: string,
): void => {
    writeEntityImage({ entityType, entityId, service: 'none', token: '', fetchedAt: 0 });
};

/** Persists a freshly resolved image so the next request is instant. */
export const persistResolvedEntityImage = (
    entityType: EntityImageEntityType,
    entityId: string,
    url: string | null | undefined,
): void => {
    const token = toEntityImageToken(url, entityId);
    if (!token) {
        return;
    }
    writeEntityImage({ entityType, entityId, service: token.service, token: token.token });
};

/** Convenience reader used by the revalidators. */
export const readEntityImageForEntity = (
    entityType: EntityImageEntityType,
    entityId: string,
): ReturnType<typeof readEntityImage> => readEntityImage(entityType, entityId);

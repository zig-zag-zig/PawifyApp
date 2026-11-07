import { createLogger } from '../../common/logging/logger.js';
import {
    readEntityImage,
    type EntityImageEntityType,
    type EntityImageService,
} from '../../infrastructure/musicDb/entityImageRepository.js';

const logger = createLogger('services.musicApi.mirrorEntityImages');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long a recorded "no image anywhere" stays authoritative.
 *
 * A `none` row is written from the release dump or by the image worker after
 * every provider answered "no artwork". New artwork does get uploaded later, so
 * the fact is trusted for a week and then re-derived by the live chain.
 */
export const CONFIRMED_MISS_MAX_AGE_MS = 7 * DAY_MS;

/** Only used to log that a long-unverified row is still being served. */
const RESOLVED_IMAGE_REVIEW_AGE_MS = 30 * DAY_MS;

export type MirrorImage =
    | { kind: 'resolved'; url: string; service: EntityImageService }
    | { kind: 'missing' }
    /** No usable row: absent, `pending`, stale `none`, or no mirror at all. */
    | { kind: 'none' };

/**
 * Reads the mirror's artwork verdict for one entity.
 *
 * The mirror is a frozen snapshot of what the artwork providers answered, so it
 * turns a provider round trip into one primary-key lookup. `pending` means
 * "queued for the worker but not answered yet" and is deliberately treated as
 * absent, so the user still gets a live resolution instead of a blank tile.
 *
 * Never throws: `readEntityImage` swallows mirror failures and returns null.
 */
export const lookupMirrorImage = (
    entityType: EntityImageEntityType,
    mbid: string | undefined,
): MirrorImage => {
    if (!mbid) {
        return { kind: 'none' };
    }

    const record = readEntityImage(entityType, mbid);
    if (!record) {
        return { kind: 'none' };
    }

    if (record.service === 'pending') {
        return { kind: 'none' };
    }

    if (record.service === 'none') {
        const fresh =
            record.fetchedAt === 0 ||
            Date.now() - record.fetchedAt * 1000 <= CONFIRMED_MISS_MAX_AGE_MS;
        return fresh ? { kind: 'missing' } : { kind: 'none' };
    }

    if (!record.url) {
        return { kind: 'none' };
    }

    if (record.fetchedAt !== 0) {
        const ageMs = Date.now() - record.fetchedAt * 1000;
        if (ageMs > RESOLVED_IMAGE_REVIEW_AGE_MS) {
            logger.debug('serving a long-unverified mirrored image', {
                entityType,
                mbid,
                service: record.service,
                ageDays: Math.round(ageMs / DAY_MS),
            });
        }
    }

    return { kind: 'resolved', url: record.url, service: record.service };
};

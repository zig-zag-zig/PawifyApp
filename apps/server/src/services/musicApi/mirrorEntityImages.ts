import { createLogger } from '../../common/logging/logger.js';
import {
    readEntityImage,
    type EntityImageEntityType,
    type EntityImageService,
} from '../../infrastructure/musicDb/entityImageRepository.js';
import { resolveEntityImageFreshness, type EntityImageFreshness } from './entityImageFreshness.js';

const logger = createLogger('services.musicApi.mirrorEntityImages');

/** Only used to log that a long-unverified row is still being served. */
const RESOLVED_IMAGE_REVIEW_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type MirrorImage =
    | {
          kind: 'resolved';
          url: string;
          service: EntityImageService;
          freshness: EntityImageFreshness;
      }
    | { kind: 'missing'; freshness: EntityImageFreshness }
    /** No usable row: absent, `pending`, or no mirror at all. */
    | { kind: 'none' };

/**
 * Reads the mirror's artwork verdict for one entity.
 *
 * The mirror is a frozen snapshot of what the artwork providers answered, so it
 * turns a provider round trip into one primary-key lookup. `pending` means
 * "queued for the worker but not answered yet" and is deliberately treated as
 * absent, so the user still gets a live resolution instead of a blank tile.
 *
 * Every answer that comes from a stored row is returned immediately, even when the
 * row is due for a re-check: re-checks are background work (see
 * `entityImageFreshness`), never something a request waits on.
 *
 * Never throws: `readEntityImage` swallows mirror failures and returns null.
 */
export const lookupMirrorImage = (
    entityType: EntityImageEntityType,
    mbid: string | null | undefined,
): MirrorImage => {
    if (!mbid) {
        return { kind: 'none' };
    }

    const record = readEntityImage(entityType, mbid);
    if (!record) {
        return { kind: 'none' };
    }

    const freshness = resolveEntityImageFreshness(entityType, record);
    if (!freshness) {
        // `pending`: never checked yet, so the caller runs the live chain.
        return { kind: 'none' };
    }

    if (record.service === 'none') {
        return { kind: 'missing', freshness };
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
                ageDays: Math.round(ageMs / (24 * 60 * 60 * 1000)),
            });
        }
    }

    return { kind: 'resolved', url: record.url, service: record.service, freshness };
};

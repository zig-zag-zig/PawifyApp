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
    mbid: string | null | undefined,
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

/**
 * Combined artwork verdict for a release and its release group.
 *
 * A release owns its own artwork, but a pressing with none still inherits the
 * group's cover — that is the fallback the live chain gets from the Cover Art
 * Archive group endpoint. So the release row wins, the group row is next, and a
 * miss is only authoritative when *both* verdicts are recorded.
 *
 * An absent release row is not a miss: the release may simply be newer than the
 * snapshot, or still `pending` in the image worker, and both cases must fall
 * through to the live chain.
 */
export type MirrorCoverVerdict =
    | { kind: 'resolved'; url: string; service: EntityImageService }
    | { kind: 'missing' }
    | { kind: 'none' };

export const lookupMirrorReleaseCover = (
    releaseId: string | null | undefined,
    releaseGroupId: string | null | undefined,
): MirrorCoverVerdict => {
    const release = lookupMirrorImage('release', releaseId);
    if (release.kind === 'resolved') {
        return release;
    }

    const group = lookupMirrorImage('release_group', releaseGroupId);
    if (group.kind === 'resolved') {
        return group;
    }

    if (release.kind === 'missing' && group.kind === 'missing') {
        return { kind: 'missing' };
    }

    return { kind: 'none' };
};

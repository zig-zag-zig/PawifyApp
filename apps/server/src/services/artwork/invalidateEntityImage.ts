import { createLogger } from '../../common/logging/logger.js';
import { isAbortError } from '../../services/musicApi/httpClient.js';
import { resolveArtistImage } from '../../services/musicApi/artistImageSources.js';
import {
    fetchReleaseCover,
    fetchReleaseGroupCover,
} from '../../services/coverArt/coverArtLookup.js';
import {
    readEntityImage,
    writeEntityImage,
    toEntityImageToken,
    type EntityImageEntityType,
} from '../../infrastructure/musicDb/entityImageRepository.js';
import { getArtistImageProviderLinksFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';

const logger = createLogger('services.artwork.invalidateEntityImage');

/** One probe per entity per window: a shaky connection must not become a probe loop. */
const PROBE_COOLDOWN_MS = 5 * 60 * 1000;

const lastProbeAt = new Map<string, number>();

export type InvalidateEntityImageResult = {
    /** True when the stored URL was confirmed dead and replaced (or cleared). */
    invalidated: boolean;
    /** URL the client should render now, or null when there is definitively none. */
    url: string | null;
};

const cooldownActive = (key: string, now: number): boolean => {
    const previous = lastProbeAt.get(key);
    return previous !== undefined && now - previous < PROBE_COOLDOWN_MS;
};

/**
 * Returns true only when the CDN itself says the image is gone.
 *
 * A 200 means the image is fine (the client may be offline or behind a proxy), and a
 * 5xx/timeout is transient, so neither may delete a valid row.
 */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Probes the artwork CDN directly.
 *
 * The base URL is whatever the provider handed us, so this cannot go through the
 * MusicBrainz-style provider endpoints; a plain conditional HEAD is enough and it is
 * not rate limited the way the providers' APIs are.
 */
const isUrlConfirmedDead = async (url: string): Promise<boolean> => {
    if (!/^https?:\/\//i.test(url)) {
        return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
        if (response.ok) {
            return false;
        }
        return response.status === 404 || response.status === 403 || response.status === 410;
    } catch (error) {
        if (isAbortError(error)) {
            return false;
        }
        return false;
    } finally {
        clearTimeout(timer);
    }
};

const resolveCurrentUrl = (entityType: EntityImageEntityType, entityId: string): string | null => {
    const record = readEntityImage(entityType, entityId);
    if (!record || record.service === 'pending' || record.service === 'none') {
        return null;
    }
    return record.url;
};

const resolveFreshUrl = async (
    entityType: EntityImageEntityType,
    entityId: string,
): Promise<string | null> => {
    if (entityType === 'artist') {
        const links = getArtistImageProviderLinksFromMirror(entityId);
        const resolution = await resolveArtistImage({
            artistId: entityId,
            artistName: links?.artistName,
            deezerUrls: links?.deezerUrls ?? [],
            tidalUrls: links?.tidalUrls ?? [],
            discogsUrls: links?.discogsUrls ?? [],
        });
        return resolution.image ?? null;
    }

    if (entityType === 'release_group') {
        return (await fetchReleaseGroupCover(entityId)) ?? null;
    }

    return (await fetchReleaseCover(entityId, null)) ?? null;
};

/**
 * Replaces an artwork row whose upstream image was deleted.
 *
 * Called from the mobile image components when a stored URL fails to load. The probe
 * is deliberately conservative: only a confirmed 404/403/410 replaces the row, so a
 * client that lost connectivity can never wipe valid artwork.
 */
export const invalidateEntityImage = async (
    entityType: EntityImageEntityType,
    entityId: string,
    now: number = Date.now(),
): Promise<InvalidateEntityImageResult> => {
    const cooldownKey = `${entityType}:${entityId}`;
    const currentUrl = resolveCurrentUrl(entityType, entityId);

    if (cooldownActive(cooldownKey, now)) {
        return { invalidated: false, url: currentUrl };
    }
    lastProbeAt.set(cooldownKey, now);

    if (!currentUrl) {
        return { invalidated: false, url: null };
    }

    if (!(await isUrlConfirmedDead(currentUrl))) {
        return { invalidated: false, url: currentUrl };
    }

    // Clear the dead row first: the resolver reads the mirror, so leaving it in place
    // would just hand the same broken URL back.
    writeEntityImage({ entityType, entityId, service: 'pending', token: '', fetchedAt: 0 });

    const nextUrl = await resolveFreshUrl(entityType, entityId);
    const token = toEntityImageToken(nextUrl, entityId);
    if (token) {
        writeEntityImage({
            entityType,
            entityId,
            service: token.service,
            token: token.token,
        });
    }

    logger.info('entity image replaced after upstream removal', {
        entityType,
        entityId,
        hadUrl: currentUrl,
        hasUrl: nextUrl !== null,
    });

    return { invalidated: true, url: nextUrl };
};

/** Test-only: clear the per-entity probe cooldown. */
export const resetInvalidateEntityImageCooldownForTests = (): void => {
    lastProbeAt.clear();
};

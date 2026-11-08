import type { ProviderValueState } from '../musicApi/types.js';
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

const ALLOWED_ARTWORK_HOSTS = [
    'coverartarchive.org',
    'archive.org',
    'dzcdn.net',
    'tidal.com',
    'discogs.com',
] as const;

const isAllowedArtworkUrl = (rawUrl: string): boolean => {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:') {
            return false;
        }
        const host = parsed.hostname.toLowerCase();
        return ALLOWED_ARTWORK_HOSTS.some(
            (allowed) => host === allowed || host.endsWith(`.${allowed}`),
        );
    } catch {
        return false;
    }
};

/**
 * Probes the artwork CDN directly.
 *
 * Restricted to known HTTPS artwork CDN hosts with manual redirect handling so an
 * unexpected redirect or non-CDN URL can never probe internal network addresses.
 */
const isUrlConfirmedDead = async (url: string): Promise<boolean> => {
    if (!isAllowedArtworkUrl(url)) {
        return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
        let current = url;
        for (let hop = 0; hop < 3; hop += 1) {
            const response = await fetch(current, {
                method: 'HEAD',
                redirect: 'manual',
                signal: controller.signal,
            });
            if (response.ok) {
                return false;
            }
            if (response.status >= 300 && response.status < 400) {
                const next = response.headers.get('location');
                if (!next) {
                    return false;
                }
                const resolved = new URL(next, current).toString();
                if (!isAllowedArtworkUrl(resolved)) {
                    return false;
                }
                current = resolved;
                continue;
            }
            return response.status === 404 || response.status === 403 || response.status === 410;
        }
        return false;
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

/**
 * Re-resolves artwork from the providers, never from the mirror.
 *
 * `excludeUrls` passes `deadUrl` into the provider chain itself: when an upstream
 * API still points at a deleted CDN file (Deezer's `cover_xl` is not HEAD-checked),
 * that provider is treated as a transient failure so the chain continues to Tidal /
 * Discogs / Cover Art Archive. If no later provider has a working image, the chain
 * answers `undefined` and the row stays `pending` instead of being marked `none`.
 */
const resolveFreshUrl = async (
    entityType: EntityImageEntityType,
    entityId: string,
    deadUrl: string,
): Promise<ProviderValueState> => {
    const excludeUrls = new Set([deadUrl.trim()]);

    if (entityType === 'artist') {
        const links = getArtistImageProviderLinksFromMirror(entityId);
        const resolution = await resolveArtistImage({
            artistId: entityId,
            artistName: links?.artistName,
            deezerUrls: links?.deezerUrls ?? [],
            tidalUrls: links?.tidalUrls ?? [],
            discogsUrls: links?.discogsUrls ?? [],
            bypassMirror: true,
            excludeUrls,
        });
        return resolution.image;
    }

    if (entityType === 'release_group') {
        return await fetchReleaseGroupCover(entityId, undefined, undefined, undefined, {
            bypassMirror: true,
            excludeUrls,
        });
    }

    return await fetchReleaseCover(entityId, null, undefined, undefined, {
        bypassMirror: true,
        excludeUrls,
    });
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

    const nextState = await resolveFreshUrl(entityType, entityId, currentUrl);
    const token = toEntityImageToken(nextState, entityId);
    if (token) {
        writeEntityImage({
            entityType,
            entityId,
            service: token.service,
            token: token.token,
        });
    }

    const nextUrl = typeof nextState === 'string' ? nextState : null;
    logger.info('entity image replaced after upstream removal', {
        entityType,
        entityId,
        hadUrl: currentUrl,
        hasUrl: nextUrl !== null,
        leftPending: nextState === undefined,
    });

    return { invalidated: true, url: nextUrl };
};

/** Test-only: clear the per-entity probe cooldown. */
export const resetInvalidateEntityImageCooldownForTests = (): void => {
    lastProbeAt.clear();
};

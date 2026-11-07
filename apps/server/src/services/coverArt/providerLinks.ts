import type { ExternalLink } from '@pawify/shared';
import { createLogger } from '../../common/logging/logger.js';
import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';

const logger = createLogger('services.coverArt.providerLinks');

export type ProviderUrls = {
    deezerUrls: string[];
    tidalUrls: string[];
};

export type ReleaseGroupLinks = ProviderUrls & {
    /** Release ids the group holds, newest first as the API returns them. */
    releaseIds: string[];
};

export const EMPTY_PROVIDER_URLS: ProviderUrls = { deezerUrls: [], tidalUrls: [] };

const DEEZER_HOST = 'deezer.com/';
const TIDAL_HOST = 'tidal.com/';

/**
 * Deezer/Tidal album links carried by the MusicBrainz API response.
 *
 * The mirror stores url-rels for releases it knows about, but a release that landed
 * after the mirror snapshot has none — and `Cover Art Archive` regularly has no
 * artwork for brand-new digital singles while Deezer/Tidal do. Passing the API's own
 * links into the provider chain is therefore the only way a just-released album gets
 * its cover without waiting for the next mirror sync.
 */
export const providerUrlsFromLinks = (
    links: readonly Pick<ExternalLink, 'service' | 'url'>[] | undefined,
): ProviderUrls => {
    const deezerUrls: string[] = [];
    const tidalUrls: string[] = [];

    for (const link of links ?? []) {
        const bucket = bucketForLink(link);
        if (bucket === 'deezer' && !deezerUrls.includes(link.url)) {
            deezerUrls.push(link.url);
        }
        if (bucket === 'tidal' && !tidalUrls.includes(link.url)) {
            tidalUrls.push(link.url);
        }
    }

    return { deezerUrls, tidalUrls };
};

const bucketForLink = (link: Pick<ExternalLink, 'service' | 'url'>): 'deezer' | 'tidal' | null => {
    if (link.service === 'deezer') return 'deezer';
    if (link.service === 'tidal') return 'tidal';
    // Relations that fail the link classifier (unusual hosts, older payloads) still
    // carry a usable album url, so fall back to the host check.
    return bucketForUrl(link.url);
};

const bucketForUrl = (url: string): 'deezer' | 'tidal' | null => {
    const lower = url.toLowerCase();
    if (lower.includes(DEEZER_HOST)) return 'deezer';
    if (lower.includes(TIDAL_HOST)) return 'tidal';
    return null;
};

type MusicBrainzRelation = { url?: { resource?: string } };

const providerUrlsFromRelations = (
    relations: readonly MusicBrainzRelation[] | undefined,
): ProviderUrls => {
    const deezerUrls: string[] = [];
    const tidalUrls: string[] = [];

    for (const relation of relations ?? []) {
        const url = relation.url?.resource;
        if (typeof url !== 'string' || url.length === 0) continue;

        const bucket = bucketForUrl(url);
        if (bucket === 'deezer' && !deezerUrls.includes(url)) deezerUrls.push(url);
        if (bucket === 'tidal' && !tidalUrls.includes(url)) tidalUrls.push(url);
    }

    return { deezerUrls, tidalUrls };
};

/**
 * Release-level probes are capped: a group with 40 pressings does not need 40 API
 * calls to find one cover, and MusicBrainz allows 1 request/second.
 */
const MAX_RELEASE_PROBES = 3;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2048;

type CacheEntry<T> = { value: T; expiresAt: number };

const groupCache = new Map<string, CacheEntry<ReleaseGroupLinks>>();
const releaseCache = new Map<string, CacheEntry<ProviderUrls>>();
const groupInFlight = new Map<string, Promise<ReleaseGroupLinks>>();
const releaseInFlight = new Map<string, Promise<ProviderUrls>>();

const readCache = <T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined => {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return undefined;
    }
    return entry.value;
};

const writeCache = <T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void => {
    if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const readMusicBrainzRelations = (payload: unknown): MusicBrainzRelation[] => {
    if (!isRecord(payload)) return [];
    const relations = payload['relations'];
    return Array.isArray(relations) ? (relations as MusicBrainzRelation[]) : [];
};

const readMusicBrainzReleaseIds = (payload: unknown): string[] => {
    if (!isRecord(payload)) return [];
    const releases = payload['releases'];
    if (!Array.isArray(releases)) return [];

    const ids: string[] = [];
    for (const release of releases) {
        if (!isRecord(release)) continue;
        const id = release['id'];
        if (typeof id === 'string' && id.length > 0) ids.push(id);
    }
    return ids;
};

const fetchReleaseLinks = async (
    releaseId: string,
    signal?: AbortSignal,
): Promise<{ urls: ProviderUrls; resolved: boolean }> => {
    const payload = await fetchMusicBrainz(
        `/release/${releaseId}?fmt=json&inc=url-rels`,
        'GET',
        signal,
        'background',
    );

    // `fetchMusicBrainz` answers `null` for a transient failure; that is not the same
    // as "this release has no links" and must not be cached as one.
    if (!isRecord(payload)) {
        return { urls: EMPTY_PROVIDER_URLS, resolved: false };
    }

    return { urls: providerUrlsFromRelations(readMusicBrainzRelations(payload)), resolved: true };
};

/**
 * Deezer/Tidal links for a release the mirror has never seen.
 *
 * Only called when SQLite has no provider links *and* no trace of the entity, so a
 * normal page costs zero MusicBrainz requests. Results are cached in-process because
 * the caller (a cover task) runs once per page load until the cover state is written.
 *
 * A resolved answer that happens to carry no streaming links is cached too, exactly
 * like the release-group path: the release is simply not on Deezer or Tidal, and
 * re-probing it on every page load would spend one rate-limited request each time for
 * the same empty result. Transient failures (`resolved === false`) are never cached.
 */
export const getReleaseLinksFromApi = async (
    releaseId: string,
    signal?: AbortSignal,
): Promise<ProviderUrls> => {
    const cached = readCache(releaseCache, releaseId);
    if (cached) return cached;

    const inFlight = releaseInFlight.get(releaseId);
    if (inFlight) return await inFlight;

    const promise = (async () => {
        try {
            const { urls, resolved } = await fetchReleaseLinks(releaseId, signal);
            if (resolved) {
                writeCache(releaseCache, releaseId, urls);
            }
            return urls;
        } catch (error) {
            logger.warn('release provider links lookup failed', {
                releaseId,
                error: error instanceof Error ? error.message : String(error),
            });
            return EMPTY_PROVIDER_URLS;
        } finally {
            releaseInFlight.delete(releaseId);
        }
    })();

    releaseInFlight.set(releaseId, promise);
    return await promise;
};

/**
 * Deezer/Tidal links for a release group the mirror has never seen.
 *
 * The release-group relations are tried first (many groups link the streaming
 * provider directly); when the group has none, up to `MAX_RELEASE_PROBES` of its
 * releases are asked instead, because that is where MusicBrainz users usually attach
 * the streaming links.
 */
export const getReleaseGroupLinksFromApi = async (
    releaseGroupId: string,
    signal?: AbortSignal,
): Promise<ReleaseGroupLinks> => {
    const cached = readCache(groupCache, releaseGroupId);
    if (cached) return cached;

    const inFlight = groupInFlight.get(releaseGroupId);
    if (inFlight) return await inFlight;

    const promise = (async () => {
        try {
            const payload = await fetchMusicBrainz(
                `/release-group/${releaseGroupId}?fmt=json&inc=releases+url-rels`,
                'GET',
                signal,
                'background',
            );

            if (!isRecord(payload)) {
                // Transient failure: report nothing, cache nothing, so the next page
                // load retries instead of hiding the cover for hours.
                return { ...EMPTY_PROVIDER_URLS, releaseIds: [] };
            }

            const groupUrls = providerUrlsFromRelations(readMusicBrainzRelations(payload));
            const releaseIds = readMusicBrainzReleaseIds(payload);
            let urls = groupUrls;

            if (urls.deezerUrls.length === 0 && urls.tidalUrls.length === 0) {
                for (const releaseId of releaseIds.slice(0, MAX_RELEASE_PROBES)) {
                    const releaseUrls = await getReleaseLinksFromApi(releaseId, signal);
                    if (releaseUrls.deezerUrls.length > 0 || releaseUrls.tidalUrls.length > 0) {
                        urls = releaseUrls;
                        break;
                    }
                }
            }

            const links: ReleaseGroupLinks = { ...urls, releaseIds };

            // An empty answer may simply be a release nobody has linked yet, so it is
            // cached too: the cover miss is cached by the caller anyway, and this
            // keeps every page load from re-probing the same brand-new group.
            writeCache(groupCache, releaseGroupId, links);
            return links;
        } catch (error) {
            logger.warn('release-group provider links lookup failed', {
                releaseGroupId,
                error: error instanceof Error ? error.message : String(error),
            });
            return { ...EMPTY_PROVIDER_URLS, releaseIds: [] };
        } finally {
            groupInFlight.delete(releaseGroupId);
        }
    })();

    groupInFlight.set(releaseGroupId, promise);
    return await promise;
};

/** Test helper: clears the in-process caches so each case starts cold. */
export const resetProviderLinkCachesForTests = (): void => {
    groupCache.clear();
    releaseCache.clear();
    groupInFlight.clear();
    releaseInFlight.clear();
};

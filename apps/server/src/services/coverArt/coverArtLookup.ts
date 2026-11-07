import { resolveReleaseImage } from '../musicApi/releaseImageSources.js';
import {
    getProviderUrlsForReleasesFromMirror,
    getReleaseIdsForGroupFromMirror,
    releaseExistsInMirror,
} from '../../infrastructure/musicDb/musicDbRepositories.js';
import {
    getReleaseGroupLinksFromApi,
    getReleaseLinksFromApi,
    type ProviderUrls,
} from './providerLinks.js';
import {
    mapCoverState,
    shouldRefetchRemoteState,
    TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
} from '../../utils/helpers/remoteStateHelpers.js';
import type { RemoteValueState } from '@pawify/shared';
import type { CoverState } from '../../utils/types/cacheTypes.js';
import { isRemoteValueState } from '../../common/utils/objectGuards.js';

export type CoverLookupResult = {
    state: CoverState;
    isFallback: boolean;
};

export const hasUsableUrl = (url: RemoteValueState): url is string =>
    typeof url === 'string' && url.trim().length > 0;

export const shouldUseCachedState = (
    state: CoverState | undefined,
    now: number = Date.now(),
): state is CoverState =>
    !!state &&
    isRemoteValueState(state.url) &&
    (state.url !== null || state.confirmedMiss === true) &&
    !shouldRefetchRemoteState(state, now);

export const resolveMiss = (values: RemoteValueState[]): null | undefined =>
    values.some((value) => value === undefined) ? undefined : null;

export const mapResolvedCoverState = (
    url: RemoteValueState,
    isFallback: boolean,
    primaryMisses: RemoteValueState[],
): CoverState => {
    if (hasUsableUrl(url) && isFallback && primaryMisses.some((value) => value === undefined)) {
        return {
            url,
            nextRefetchAt: Date.now() + TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS,
        };
    }

    return mapCoverState(url);
};

/**
 * Deezer/Tidal album links for a release.
 *
 * Read from the mirror in bulk; an empty result is normal (most releases are not on
 * either streaming service) and simply means the chain goes straight to CAA.
 */
export const getReleaseProviderUrls = (
    releaseIds: readonly string[],
): Map<string, { deezerUrls: string[]; tidalUrls: string[] }> =>
    getProviderUrlsForReleasesFromMirror(releaseIds);

const hasProviderUrls = (urls: ProviderUrls): boolean =>
    urls.deezerUrls.length > 0 || urls.tidalUrls.length > 0;

/**
 * Provider links for a release the mirror has never stored.
 *
 * The mirror is the cheap, always-on source, but it is a snapshot: a release added
 * after the last sync has no url-rels locally even though MusicBrainz has them. In
 * that case (and only in that case) the API is asked once, and the answer is cached
 * in-process for the cover task's lifetime.
 */
const providerUrlsForUnknownRelease = async (
    releaseId: string,
    signal?: AbortSignal,
): Promise<ProviderUrls> => {
    if (releaseExistsInMirror(releaseId) === true) {
        return { deezerUrls: [], tidalUrls: [] };
    }
    return await getReleaseLinksFromApi(releaseId, signal);
};

/**
 * Provider links for a release group the mirror has never stored.
 *
 * Same idea as the release fallback: only a group absent from SQLite can be missing
 * from it, so groups the mirror knows are never re-probed against the 1 req/s API.
 */
const providerUrlsForUnknownGroup = async (
    releaseGroupId: string,
    signal?: AbortSignal,
): Promise<ProviderUrls> => {
    if (getReleaseIdsForGroupFromMirror(releaseGroupId).length > 0) {
        return { deezerUrls: [], tidalUrls: [] };
    }
    const links = await getReleaseGroupLinksFromApi(releaseGroupId, signal);
    return { deezerUrls: links.deezerUrls, tidalUrls: links.tidalUrls };
};

/**
 * Resolves a release cover through Deezer → Tidal → Cover Art Archive.
 *
 * The streaming providers answer from their own CDNs; CAA is the last resort because
 * it redirects to Internet Archive storage, which is the slow part.
 */
export const fetchReleaseCover = async (
    releaseId: string,
    releaseGroupId: string | null,
    signal?: AbortSignal,
    providerUrls?: { deezerUrls: string[]; tidalUrls: string[] },
): Promise<RemoteValueState> => {
    let urls = providerUrls ?? getReleaseProviderUrlsForOne(releaseId);

    if (!hasProviderUrls(urls)) {
        const fallback = await providerUrlsForUnknownRelease(releaseId, signal);
        if (hasProviderUrls(fallback)) {
            urls = fallback;
        }
    }

    const resolution = await resolveReleaseImage({
        deezerUrls: urls.deezerUrls,
        tidalUrls: urls.tidalUrls,
        // The release endpoint is preferred for a release's own cover; the group is
        // the fallback the caller reaches for only when this returns nothing.
        releaseId,
        signal,
    });

    return resolution.image;
};

const getReleaseProviderUrlsForOne = (
    releaseId: string,
): { deezerUrls: string[]; tidalUrls: string[] } =>
    getProviderUrlsForReleasesFromMirror([releaseId]).get(releaseId) ?? {
        deezerUrls: [],
        tidalUrls: [],
    };

/**
 * Resolves a release-group cover through Deezer → Tidal → Cover Art Archive.
 *
 * A release group has no url-rels of its own in the mirror, so candidates are
 * derived from its releases (first non-empty provider list wins) and CAA is asked for
 * the group endpoint.
 */
export const fetchReleaseGroupCover = async (
    releaseGroupId: string,
    signal?: AbortSignal,
    releaseIds?: string[],
    aggregatedProviderUrls?: { deezerUrls: string[]; tidalUrls: string[] },
): Promise<RemoteValueState> => {
    let deezerUrls = aggregatedProviderUrls?.deezerUrls ?? [];
    let tidalUrls = aggregatedProviderUrls?.tidalUrls ?? [];

    if (!aggregatedProviderUrls) {
        const ids = releaseIds ?? getReleaseIdsForGroupFromMirror(releaseGroupId);
        const providerUrls = getProviderUrlsForReleasesFromMirror(ids);
        deezerUrls = [];
        tidalUrls = [];
        for (const urls of providerUrls.values()) {
            deezerUrls.push(...urls.deezerUrls);
            tidalUrls.push(...urls.tidalUrls);
        }
    }

    if (deezerUrls.length === 0 && tidalUrls.length === 0) {
        // A brand-new group: the mirror has no release ids for it, so its url-rels
        // (or its releases') have to come from the API. Groups the mirror knows are
        // left alone even when they have no streaming links at all.
        const fallback = await providerUrlsForUnknownGroup(releaseGroupId, signal);
        deezerUrls = fallback.deezerUrls;
        tidalUrls = fallback.tidalUrls;
    }

    const resolution = await resolveReleaseImage({
        deezerUrls,
        tidalUrls,
        releaseGroupId,
        signal,
    });

    return resolution.image;
};

/**
 * Aggregates Deezer/Tidal links for a set of releases into one candidate list.
 *
 * Page workers call this once for the whole page so provider relations are read from
 * SQLite in one place instead of once per release group.
 */
export const aggregateProviderUrls = (
    providerUrlsByRelease: Map<string, { deezerUrls: string[]; tidalUrls: string[] }>,
): { deezerUrls: string[]; tidalUrls: string[] } => {
    const deezerUrls: string[] = [];
    const tidalUrls: string[] = [];

    for (const urls of providerUrlsByRelease.values()) {
        deezerUrls.push(...urls.deezerUrls);
        tidalUrls.push(...urls.tidalUrls);
    }

    return { deezerUrls, tidalUrls };
};

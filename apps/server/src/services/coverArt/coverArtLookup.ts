import { resolveReleaseImage } from '../musicApi/releaseImageSources.js';
import {
    getProviderUrlsForReleasesFromMirror,
    getReleaseIdsForGroupFromMirror,
} from '../../infrastructure/musicDb/musicDbRepositories.js';
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
    const urls = providerUrls ?? getReleaseProviderUrlsForOne(releaseId);
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

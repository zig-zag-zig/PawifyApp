import { mapCoverState } from '../utils/helpers/remoteStateHelpers.js';
import {
    createArtistReleaseGroupCoverCacheContext,
    flushArtistReleaseGroupCoverCacheContext,
    readArtistReleaseGroupCoverCache,
    readReleaseCoverCache,
    upsertArtistReleaseGroupCoverState,
    writeReleaseCoverCache,
    type ArtistReleaseGroupCoverCacheContext,
} from './coverArt/coverArtCache.js';
import {
    fetchReleaseCoverFromCaa,
    fetchReleaseGroupCoverFromCaa,
    getFallbackReleaseCover,
    hasUnseenFallbackReleaseIds,
    hasUsableUrl,
    mapResolvedCoverState,
    pickAnyCachedReleaseCover,
    pickCachedPeerReleaseCover,
    pickCachedReleaseCoverFromIds,
    resolveMiss,
    shouldUseCachedState,
    type CoverLookupResult,
} from './coverArt/coverArtLookup.js';

export { createArtistReleaseGroupCoverCacheContext, flushArtistReleaseGroupCoverCacheContext };

export const getReleaseGroupCover = async (
    artistId: string | undefined,
    releaseGroupId: string,
    fallbackReleaseIds: string[],
    ttl: number | undefined,
    signal?: AbortSignal,
    artistCoverCacheContext?: ArtistReleaseGroupCoverCacheContext,
): Promise<CoverLookupResult> => {
    const artistCoverCache = artistId
        ? (artistCoverCacheContext?.cache ?? (await readArtistReleaseGroupCoverCache(artistId)))
        : undefined;
    const current = artistCoverCache?.[releaseGroupId];
    const now = Date.now();

    if (shouldUseCachedState(current, now)) {
        if (!hasUsableUrl(current.url)) {
            const releaseCache = await readReleaseCoverCache(releaseGroupId);
            const cachedFallback =
                pickCachedReleaseCoverFromIds(releaseCache, fallbackReleaseIds, now) ??
                pickAnyCachedReleaseCover(releaseCache, now);

            if (cachedFallback) {
                const upgradedState = mapResolvedCoverState(cachedFallback.url, true, [
                    current.url,
                ]);
                await upsertArtistReleaseGroupCoverState(
                    artistId,
                    artistCoverCache,
                    releaseGroupId,
                    upgradedState,
                    ttl,
                    artistCoverCacheContext,
                );

                return {
                    state: upgradedState,
                    isFallback: true,
                };
            }

            if (hasUnseenFallbackReleaseIds(releaseCache, fallbackReleaseIds)) {
                const fallback = await getFallbackReleaseCover(
                    releaseGroupId,
                    fallbackReleaseIds,
                    ttl,
                    signal,
                    [current.url],
                );
                const fallbackUrl = fallback.state.url;
                const upgradedState = mapResolvedCoverState(
                    fallbackUrl,
                    hasUsableUrl(fallbackUrl),
                    [current.url, fallback.state.url],
                );
                await upsertArtistReleaseGroupCoverState(
                    artistId,
                    artistCoverCache,
                    releaseGroupId,
                    upgradedState,
                    ttl,
                    artistCoverCacheContext,
                );

                return {
                    state: upgradedState,
                    isFallback: hasUsableUrl(fallbackUrl),
                };
            }
        }

        return {
            state: current,
            isFallback: false,
        };
    }

    const directGroupCover = await fetchReleaseGroupCoverFromCaa(releaseGroupId, signal);
    let result: CoverLookupResult;

    if (hasUsableUrl(directGroupCover)) {
        result = {
            state: mapCoverState(directGroupCover),
            isFallback: false,
        };
    } else {
        const fallback = await getFallbackReleaseCover(
            releaseGroupId,
            fallbackReleaseIds,
            ttl,
            signal,
            [directGroupCover],
        );
        const url = fallback.state.url;

        result = {
            state: mapResolvedCoverState(url, hasUsableUrl(url), [
                directGroupCover,
                fallback.state.url,
            ]),
            isFallback: hasUsableUrl(url),
        };
    }

    await upsertArtistReleaseGroupCoverState(
        artistId,
        artistCoverCache,
        releaseGroupId,
        result.state,
        ttl,
        artistCoverCacheContext,
    );

    return result;
};

export const getReleaseCover = async (
    releaseId: string,
    releaseGroupId: string | null,
    ttl: number | undefined,
    signal?: AbortSignal,
): Promise<CoverLookupResult> => {
    if (!releaseGroupId) {
        const directReleaseCover = await fetchReleaseCoverFromCaa(releaseId, signal);
        return {
            state: mapCoverState(directReleaseCover),
            isFallback: false,
        };
    }

    const cache = await readReleaseCoverCache(releaseGroupId);
    const current = cache[releaseId];
    const now = Date.now();

    if (shouldUseCachedState(current, now)) {
        return {
            state: current,
            isFallback: false,
        };
    }

    const directReleaseCover = await fetchReleaseCoverFromCaa(releaseId, signal);

    if (hasUsableUrl(directReleaseCover)) {
        const state = mapCoverState(directReleaseCover);
        cache[releaseId] = state;
        await writeReleaseCoverCache(releaseGroupId, cache, ttl);

        return {
            state,
            isFallback: false,
        };
    }

    const directReleaseState = mapCoverState(directReleaseCover);
    const cachedPeerCover = pickCachedPeerReleaseCover(cache, releaseId, now);
    if (cachedPeerCover) {
        const state = mapResolvedCoverState(cachedPeerCover.url, true, [directReleaseState.url]);
        cache[releaseId] = state;
        await writeReleaseCoverCache(releaseGroupId, cache, ttl);

        return {
            state,
            isFallback: true,
        };
    }

    const directGroupCover = await fetchReleaseGroupCoverFromCaa(releaseGroupId, signal);
    const url = hasUsableUrl(directGroupCover)
        ? directGroupCover
        : resolveMiss([directReleaseState.url, directGroupCover]);
    const state = mapResolvedCoverState(url, hasUsableUrl(url), [
        directReleaseState.url,
        directGroupCover,
    ]);

    cache[releaseId] = state;
    await writeReleaseCoverCache(releaseGroupId, cache, ttl);

    return {
        state,
        isFallback: hasUsableUrl(url),
    };
};

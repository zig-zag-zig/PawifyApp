export const RELEASE_GROUP_RELEASES_CACHE_SUFFIX = 'releaseGroupReleasesV3' as const;

export const getCacheKey = (
    prefix: string,
    postfix:
        | 'artistDetails'
        | 'artistImages'
        | 'artistReleases'
        | 'artistReleaseGroupCatalog'
        | 'artistReleaseGroupCovers'
        | typeof RELEASE_GROUP_RELEASES_CACHE_SUFFIX
        | 'releaseGroupReleaseCovers'
        | 'releaseLyrics',
) => `${prefix}_${postfix}`;

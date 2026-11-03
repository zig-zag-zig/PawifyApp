export const getCacheKey = (
    prefix: string,
    postfix:
        | 'artistDetails'
        | 'artistImages'
        | 'artistReleases'
        | 'artistReleaseGroupCatalog'
        | 'artistReleaseGroupCovers'
        | 'releaseGroupReleases'
        | 'releaseGroupReleaseCovers'
        | 'releaseLyrics',
) => `${prefix}_${postfix}`;

export const getCacheKey = (
    prefix: string,
    postfix:
        | 'artistDetails'
        | 'artistImages'
        | 'artistReleases'
        | 'artistReleaseScan'
        | 'artistReleaseGroupCovers'
        | 'releaseGroupReleases'
        | 'releaseGroupReleaseCovers'
        | 'releaseLyrics',
) => `${prefix}_${postfix}`;

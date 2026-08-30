export const getCacheKey = (
    prefix: string,
    postfix:
        | 'artistDetails'
        | 'artistImages'
        | 'artistReleases'
        | 'artistReleaseGroupCovers'
        | 'releaseGroupReleases'
        | 'releaseGroupReleaseCovers'
        | 'releaseLyrics',
) => `${prefix}_${postfix}`;

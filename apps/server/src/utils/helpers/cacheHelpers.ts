export const getCacheKey = (
    prefix: string,
    postfix:
        | 'artistDetails'
        | 'artistImages'
        | 'artistReleases'
        | 'artistReleaseScanWithRecordings'
        | 'artistReleaseGroupCovers'
        | 'releaseGroupReleases'
        | 'releaseGroupReleaseCovers'
        | 'releaseLyrics',
) => `${prefix}_${postfix}`;

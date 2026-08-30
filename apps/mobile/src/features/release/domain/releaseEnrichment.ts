import type { Release, Track } from '@pawify/shared';

export function cloneRelease(release: Release): Release {
    return JSON.parse(JSON.stringify(release)) as Release;
}

export function flattenReleaseTracks(release: Release): Track[] {
    return release.media
        .flatMap(media => media.tracks)
        .filter((track): track is Track => Boolean(track));
}

export function collectTrackLyricsForRelease(
    release: Release,
    lyricsCache: Record<string, string | null | undefined>
): Record<string, string | null | undefined> {
    const collected: Record<string, string | null | undefined> = {};

    flattenReleaseTracks(release).forEach(track => {
        if (lyricsCache[track.id] !== undefined) {
            collected[track.id] = lyricsCache[track.id];
        }
    });

    return collected;
}

export function collectArtistImagesForRelease(
    release: Release,
    artistImageCache: Record<string, string | null | undefined>
): Record<string, string | null | undefined> {
    const collected: Record<string, string | null | undefined> = {};

    const collectArtist = (artistId: string) => {
        if (artistImageCache[artistId] !== undefined) {
            collected[artistId] = artistImageCache[artistId];
        }
    };

    release['artist-credit'].forEach(artist => collectArtist(artist.id));

    flattenReleaseTracks(release).forEach(track => {
        track['artist-credit'].forEach(artist => collectArtist(artist.id));
    });

    return collected;
}

import type { Artist } from '../../../shared/music';

export function deduplicateArtists(newArtists: Artist[], existingArtists: Artist[]): Artist[] {
    return newArtists.filter(candidate => !existingArtists.some(current => current.id === candidate.id));
}

/**
 * Appends artists from `artists` to `target` that have not been seen before
 * (tracked via `seenArtistIds`). Mutates `target` in place and returns the
 * newly added artists.
 */
export function appendUniqueArtists(
    target: Artist[],
    artists: Artist[],
    seenArtistIds: Set<string>,
): Artist[] {
    const addedArtists: Artist[] = [];

    for (const artist of artists) {
        if (seenArtistIds.has(artist.id)) {
            continue;
        }

        seenArtistIds.add(artist.id);
        target.push(artist);
        addedArtists.push(artist);
    }

    return addedArtists;
}

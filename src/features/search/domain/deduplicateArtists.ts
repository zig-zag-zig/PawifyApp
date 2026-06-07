import type { Artist } from '../../../shared/music';

export function deduplicateArtists(newArtists: Artist[], existingArtists: Artist[]): Artist[] {
    return newArtists.filter(candidate => !existingArtists.some(current => current.id === candidate.id));
}

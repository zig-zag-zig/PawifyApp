import type { Artist } from '../../../modules/models/models';

export function deduplicateArtists(newArtists: Artist[], existingArtists: Artist[]): Artist[] {
    return newArtists.filter(candidate => !existingArtists.some(current => current.id === candidate.id));
}

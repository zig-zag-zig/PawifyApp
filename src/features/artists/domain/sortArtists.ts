import type { ArtistMinimal } from '../../../modules/models/models';

export function sortArtistsByDisplayName(artists: ArtistMinimal[]): ArtistMinimal[] {
    return [...artists].sort((a, b) => {
        const nameA = a.name.trim().toLowerCase();
        const nameB = b.name.trim().toLowerCase();

        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
    });
}

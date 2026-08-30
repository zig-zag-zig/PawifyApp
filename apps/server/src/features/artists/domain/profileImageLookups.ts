import type { Artist, ExternalLink } from '@pawify/shared';
import type { ArtistProfileImageLookup } from '../../../utils/types/taskTypes.js';
import { getExternalLinkUrlsByService } from '../../../utils/helpers/externalLinks.js';
import { normalizeDiscogsUrls } from '../../../services/tasks/backgroundTaskMappers.js';

type ArtistSummaryWithOptionalDiscogsUrls = {
    id: string;
    name?: string;
    discogsUrls?: string[];
};

const getDiscogsUrlsFromExternalLinks = (externalLinks: ExternalLink[] | undefined): string[] => {
    return getExternalLinkUrlsByService(externalLinks, 'discogs');
};

export const mapArtistSummaryToProfileImageLookup = (
    summary: ArtistSummaryWithOptionalDiscogsUrls,
): ArtistProfileImageLookup => {
    const normalizedDiscogsUrls = normalizeDiscogsUrls(summary.discogsUrls);

    return {
        artistId: summary.id,
        artistName: summary.name,
        discogsUrls: normalizedDiscogsUrls.length > 0 ? normalizedDiscogsUrls : undefined,
    };
};

export const mapArtistToProfileImageLookup = (
    artistId: string,
    artist: Artist,
): ArtistProfileImageLookup => ({
    artistId,
    artistName: artist.name,
    discogsUrls: getDiscogsUrlsFromExternalLinks(artist.externalLinks),
});

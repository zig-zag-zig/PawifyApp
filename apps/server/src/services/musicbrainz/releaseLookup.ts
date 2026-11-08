import {
    getPrimaryArtistId,
    mapToRelease,
} from '../../infrastructure/musicbrainz/musicbrainzMapper.js';
import type { Release } from '@pawify/shared';
import { getReleaseCover } from '../coverArtService.js';
import { providerUrlsFromLinks } from '../coverArt/providerLinks.js';
import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';
import { getReleaseMetadataFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';
import { createLogger } from '../../common/logging/logger.js';

const logger = createLogger('services.musicbrainz.releaseLookup');

/** Only the tracklist is needed from the API now; everything else comes from the mirror. */
/**
 * Combines the API release (authoritative for the tracklist) with mirror metadata.
 *
 * The API wins where a wrong value would break playback or navigation: the media
 * list, the release group it was fetched with, and the artist it belongs to. The
 * mirror wins for fields it stores verbatim and the API only echoes back, and it is
 * only used where it actually has a value — an empty mirror list must not blank out
 * credits or links that the API did return.
 */
export const mergeReleaseMetadata = (
    apiRelease: Release,
    metadata: Omit<Release, 'media' | 'cover_url'>,
): Release => ({
    ...apiRelease,
    title: metadata.title.length > 0 ? metadata.title : apiRelease.title,
    date: metadata.date ?? apiRelease.date,
    date_for_display: metadata.date_for_display,
    disambiguation: metadata.disambiguation ?? apiRelease.disambiguation,
    releaseGroupId: apiRelease.releaseGroupId ?? metadata.releaseGroupId,
    'release-group': apiRelease['release-group'] ?? metadata['release-group'],
    'artist-credit':
        apiRelease['artist-credit'].length > 0
            ? apiRelease['artist-credit']
            : metadata['artist-credit'],
    externalLinks:
        metadata.externalLinks.length > 0 ? metadata.externalLinks : apiRelease.externalLinks,
    artistId: apiRelease.artistId || metadata.artistId,
});

const fetchTracklistFromApi = async (releaseId: string): Promise<Release | null> => {
    const musicbrainzResult = await fetchMusicBrainz(
        `/release/${releaseId}?fmt=json&inc=recordings+release-groups+artist-credits+url-rels`,
    );

    if (musicbrainzResult === null) {
        return null;
    }

    return mapToRelease(
        musicbrainzResult as Parameters<typeof mapToRelease>[0],
        getPrimaryArtistId(musicbrainzResult),
    );
};

const withCover = async (release: Release): Promise<Release> => {
    // The API response already carries this release's url-rels (`inc=url-rels`), so
    // the streaming providers can be used even when the mirror has no row for the
    // release yet. Without this, a release newer than the mirror snapshot fell
    // straight through to Cover Art Archive, which usually has no art for a
    // just-released digital single, and the screen showed the placeholder.
    const apiProviderUrls = providerUrlsFromLinks(release.externalLinks);
    const hasApiProviderUrls =
        apiProviderUrls.deezerUrls.length > 0 || apiProviderUrls.tidalUrls.length > 0;

    const cover = await getReleaseCover(
        release.id,
        release.releaseGroupId,
        undefined,
        undefined,
        hasApiProviderUrls ? apiProviderUrls : undefined,
    );
    release.cover_url = cover.state.url;
    return release;
};

/**
 * Release screen data.
 *
 * The mirror stores no tracks, so this stays a hybrid: stable metadata (title,
 * date, disambiguation, release group, credits, links) comes from SQLite and the
 * tracklist from the MusicBrainz API. That is one API call per release view,
 * exactly as before the migration — the difference is that the metadata is now
 * local, and the call is only made for the screen that genuinely needs it.
 *
 * With no mirror available this is the original single API call.
 */
export const getRelease = async (releaseId: string): Promise<Release | null> => {
    try {
        let metadata: Omit<Release, 'media' | 'cover_url'> | null = null;
        try {
            metadata = getReleaseMetadataFromMirror(releaseId);
        } catch (error) {
            logger.warn('mirror release metadata failed; using MusicBrainz API', {
                releaseId,
                error: error instanceof Error ? error.message : String(error),
            });
        }

        const apiRelease = await fetchTracklistFromApi(releaseId);
        if (!apiRelease) {
            return null;
        }

        if (!metadata) {
            return await withCover(apiRelease);
        }

        return await withCover(mergeReleaseMetadata(apiRelease, metadata));
    } catch (error) {
        throw Object.assign(new Error('Failed to fetch release'), { cause: error });
    }
};

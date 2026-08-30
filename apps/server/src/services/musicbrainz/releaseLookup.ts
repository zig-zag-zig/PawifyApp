import {
    getPrimaryArtistId,
    mapToRelease,
} from '../../infrastructure/musicbrainz/musicbrainzMapper.js';
import type { Release } from '@pawify/shared';
import { getReleaseCover } from '../coverArtService.js';
import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';

export const getRelease = async (releaseId: string): Promise<Release | null> => {
    try {
        const musicbrainzResult = await fetchMusicBrainz(
            `/release/${releaseId}?fmt=json&inc=recordings+release-groups+artist-credits+url-rels`,
        );

        if (musicbrainzResult === null) {
            return null;
        }

        const release = mapToRelease(musicbrainzResult, getPrimaryArtistId(musicbrainzResult));
        const cover = await getReleaseCover(release.id, release.releaseGroupId, undefined);
        release.cover_url = cover.state.url;

        return release;
    } catch (error) {
        throw Object.assign(new Error('Failed to fetch release'), { cause: error });
    }
};

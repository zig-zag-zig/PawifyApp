import type { Release } from '../../../modules/models/models.js';
import type {
    ReleaseGroupReleasesPageEntry,
    TrackLyricsRequest,
} from '../../../utils/types/taskTypes.js';

export const collectReleaseArtistIds = (release: Release): string[] => {
    const ids = new Set<string>();

    for (const artistCredit of release['artist-credit'] ?? []) {
        if (artistCredit.id) {
            ids.add(artistCredit.id);
        }
    }

    for (const media of release.media ?? []) {
        for (const track of media.tracks ?? []) {
            for (const artistCredit of track['artist-credit'] ?? []) {
                if (artistCredit.id) {
                    ids.add(artistCredit.id);
                }
            }
        }
    }

    return Array.from(ids);
};

export const collectTrackLyricsRequests = (release: Release): TrackLyricsRequest[] => {
    const requests: TrackLyricsRequest[] = [];

    for (const media of release.media ?? []) {
        if (!media.tracks || media.tracks.length === 0) {
            continue;
        }

        for (const track of media.tracks) {
            const artistName =
                track['artist-credit']?.[0]?.name ?? release['artist-credit']?.[0]?.name;

            if (!artistName?.trim() || !track.title?.trim()) {
                continue;
            }

            requests.push({
                releaseId: release.id,
                trackId: track.id,
                artistName,
                trackName: track.title,
            });
        }
    }

    return requests;
};

export const getNewReleaseCoverDedupeKey = (entries: ReleaseGroupReleasesPageEntry[]): string => {
    const releaseIds = Array.from(
        new Set(
            entries.flatMap((entry) =>
                entry.releaseIds.map((releaseId) => `${entry.releaseGroupId}:${releaseId}`),
            ),
        ),
    ).sort((left, right) => left.localeCompare(right));

    return `new_release_covers:${releaseIds.join(',')}`;
};

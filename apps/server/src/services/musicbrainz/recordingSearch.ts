import type { ArtistCredit } from '@pawify/shared';

import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';

export type RecordingSearchResultItem = {
    id: string;
    title: string;
    'artist-credit': ArtistCredit[];
    /**
     * One release the recording appears on, used to show its cover and to open the
     * release screen from a track result. Recordings have no artwork of their own.
     */
    release: {
        id: string;
        title: string;
        releaseGroupId: string | null;
        date: string | null;
    } | null;
};

export type RecordingSearchResult = {
    recordings: RecordingSearchResultItem[];
    count: number;
};

const pickFirstReleaseWithGroup = (
    releases: unknown[],
): RecordingSearchResultItem['release'] => {
    // Prefer a release that knows its release group: the cover lookup and the
    // release-group screen both need that id.
    const parsed = releases.flatMap((release) => {
        const value = toRelease(release);
        return value ? [value] : [];
    });

    return parsed.find((release) => release.releaseGroupId !== null) ?? parsed[0] ?? null;
};

const toArtistCredit = (value: unknown): ArtistCredit | null => {
    if (!isPlainObject(value) || !isPlainObject(value.artist)) return null;
    if (typeof value.artist.id !== 'string' || typeof value.artist.name !== 'string') return null;
    return {
        id: value.artist.id,
        name: value.artist.name,
        joinphrase: typeof value.joinphrase === 'string' ? value.joinphrase : null,
    };
};

const toRelease = (value: unknown): RecordingSearchResultItem['release'] => {
    if (!isPlainObject(value) || typeof value.id !== 'string') {
        return null;
    }

    const releaseGroup = isPlainObject(value['release-group']) ? value['release-group'] : null;

    return {
        id: value.id,
        title: typeof value.title === 'string' ? value.title : '',
        releaseGroupId:
            releaseGroup && typeof releaseGroup.id === 'string' ? releaseGroup.id : null,
        date: typeof value.date === 'string' ? value.date : null,
    };
};

/** MusicBrainz-only track search; tracks are intentionally not mirrored locally. */
export const searchRecordings = async (
    query: string,
    offset: number,
    limit: number,
): Promise<RecordingSearchResult> => {
    const response = await fetchMusicBrainz(
        `/recording?query=${encodeURIComponent(query)}&fmt=json&inc=artist-credits+releases&offset=${offset}&limit=${limit}`,
    );
    const record = isPlainObject(response) ? response : {};
    const recordings = Array.isArray(record.recordings) ? record.recordings : [];

    return {
        recordings: recordings.flatMap((value): RecordingSearchResultItem[] => {
            if (!isPlainObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
                return [];
            }
            const releases = Array.isArray(value.releases) ? value.releases : [];

            return [{
                id: value.id,
                title: value.title,
                'artist-credit': Array.isArray(value['artist-credit'])
                    ? value['artist-credit'].flatMap((credit) => {
                          const parsed = toArtistCredit(credit);
                          return parsed ? [parsed] : [];
                      })
                    : [],
                release: pickFirstReleaseWithGroup(releases),
            }];
        }),
        count: typeof record.count === 'number' && Number.isFinite(record.count)
            ? Math.max(0, record.count)
            : 0,
    };
};

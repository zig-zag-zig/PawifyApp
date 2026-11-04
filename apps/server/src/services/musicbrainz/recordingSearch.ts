import type { ArtistCredit } from '@pawify/shared';

import { fetchMusicBrainz } from '../musicApi/musicBrainzClient.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';

export type RecordingSearchResultItem = {
    id: string;
    title: string;
    'artist-credit': ArtistCredit[];
};

export type RecordingSearchResult = {
    recordings: RecordingSearchResultItem[];
    count: number;
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

/** MusicBrainz-only track search; tracks are intentionally not mirrored locally. */
export const searchRecordings = async (
    query: string,
    offset: number,
    limit: number,
): Promise<RecordingSearchResult> => {
    const response = await fetchMusicBrainz(
        `/recording?query=${encodeURIComponent(query)}&fmt=json&inc=artist-credits&offset=${offset}&limit=${limit}`,
    );
    const record = isPlainObject(response) ? response : {};
    const recordings = Array.isArray(record.recordings) ? record.recordings : [];

    return {
        recordings: recordings.flatMap((value): RecordingSearchResultItem[] => {
            if (!isPlainObject(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
                return [];
            }
            return [{
                id: value.id,
                title: value.title,
                'artist-credit': Array.isArray(value['artist-credit'])
                    ? value['artist-credit'].flatMap((credit) => {
                          const parsed = toArtistCredit(credit);
                          return parsed ? [parsed] : [];
                      })
                    : [],
            }];
        }),
        count: typeof record.count === 'number' && Number.isFinite(record.count)
            ? Math.max(0, record.count)
            : 0,
    };
};

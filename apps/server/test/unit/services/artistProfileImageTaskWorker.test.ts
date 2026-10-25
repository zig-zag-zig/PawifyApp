import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    dedupeArtistLookups,
    filterValidProviderUrls,
} from '../../../src/services/tasks/workers/artistProfileImageTaskWorker.js';
import type { ArtistProfileImageLookup } from '../../../src/utils/types/taskTypes.js';

describe('artistProfileImageTaskWorker pure helpers', () => {
    describe('dedupeArtistLookups', () => {
        it('merges duplicate artistIds with later non-empty fields winning', () => {
            const lookups: ArtistProfileImageLookup[] = [
                { artistId: 'a1', artistName: 'First', discogsUrls: ['https://discogs.com/1'] },
                { artistId: 'a1', artistName: undefined, discogsUrls: ['https://discogs.com/2'] },
                { artistId: 'a2', artistName: 'Second' },
            ];

            const result = dedupeArtistLookups(lookups);

            assert.equal(result.length, 2);
            assert.deepEqual(
                result.find((lookup) => lookup.artistId === 'a1'),
                {
                    artistId: 'a1',
                    artistName: 'First',
                    discogsUrls: ['https://discogs.com/2'],
                    deezerUrls: undefined,
                    tidalUrls: undefined,
                },
            );
            assert.deepEqual(
                result.find((lookup) => lookup.artistId === 'a2'),
                {
                    artistId: 'a2',
                    artistName: 'Second',
                    discogsUrls: undefined,
                    deezerUrls: undefined,
                    tidalUrls: undefined,
                },
            );
        });

        it('merges deezer and tidal urls independently of discogs urls', () => {
            const result = dedupeArtistLookups([
                {
                    artistId: 'a1',
                    deezerUrls: ['https://www.deezer.com/artist/860'],
                    tidalUrls: ['https://tidal.com/artist/9706'],
                },
                {
                    artistId: 'a1',
                    discogsUrls: ['https://www.discogs.com/artist/45467'],
                    tidalUrls: ['https://tidal.com/artist/1'],
                },
            ]);

            assert.equal(result.length, 1);
            assert.deepEqual(result[0], {
                artistId: 'a1',
                artistName: undefined,
                discogsUrls: ['https://www.discogs.com/artist/45467'],
                deezerUrls: ['https://www.deezer.com/artist/860'],
                tidalUrls: ['https://tidal.com/artist/1'],
            });
        });

        it('prefers a later non-empty name when the first lookup has none', () => {
            const result = dedupeArtistLookups([
                { artistId: 'a1' },
                { artistId: 'a1', artistName: 'Later Name' },
            ]);

            assert.equal(result.length, 1);
            assert.equal(result[0]!.artistName, 'Later Name');
        });

        it('drops lookups without an artistId', () => {
            const result = dedupeArtistLookups([
                { artistId: 'a1' },
                { artistId: '' },
                { artistId: undefined as unknown as string },
            ]);

            assert.equal(result.length, 1);
            assert.equal(result[0]!.artistId, 'a1');
        });
    });

    describe('filterValidProviderUrls', () => {
        it('keeps only non-empty strings without trimming them', () => {
            assert.deepEqual(
                filterValidProviderUrls([
                    ' https://www.deezer.com/artist/1 ',
                    '',
                    '   ',
                    null,
                    'https://x',
                ]),
                [' https://www.deezer.com/artist/1 ', 'https://x'],
            );
        });

        it('returns an empty array for non-array input', () => {
            assert.deepEqual(filterValidProviderUrls(undefined), []);
            assert.deepEqual(filterValidProviderUrls('nope'), []);
            assert.deepEqual(filterValidProviderUrls(null), []);
        });
    });
});

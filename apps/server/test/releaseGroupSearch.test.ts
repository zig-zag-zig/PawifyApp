import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { installFetch } from './helpers/daprTestHelpers.js';
import { searchReleaseGroups } from '../src/services/musicbrainz/releaseGroupSearch.js';

const installResponse = (body: unknown) => {
    installFetch(() => new Response(JSON.stringify(body), { status: 200 }));
};

describe('release group search', () => {
    it('maps release groups and valid artist credits', async () => {
        installResponse({
            count: 1,
            'release-groups': [{
                id: 'group-1',
                title: 'Album One',
                'primary-type': 'Album',
                'first-release-date': '2025-03-01',
                'artist-credit': [
                    { artist: { id: 'artist-1', name: 'Artist One' }, joinphrase: ' & ' },
                    { artist: { id: 'artist-2', name: 'Artist Two' } },
                ],
            }],
        });

        const result = await searchReleaseGroups('user-1', 'Album One', 0, 10);
        assert.equal(result.count, 1);
        assert.deepEqual(result.releaseGroups[0], {
            id: 'group-1',
            title: 'Album One',
            'primary-type': 'Album',
            'first-release-date': '2025-03-01',
            'artist-credit': [
                { id: 'artist-1', name: 'Artist One', joinphrase: ' & ' },
                { id: 'artist-2', name: 'Artist Two', joinphrase: null },
            ],
        });
    });

    it('ignores malformed entries and invalid artist credits', async () => {
        installResponse({
            count: 3,
            'release-groups': [
                null,
                { title: 'Missing id' },
                { id: 'group-1', title: 'Valid', 'artist-credit': [null, {}, { artist: {} }] },
            ],
        });

        const result = await searchReleaseGroups('user-1', 'test', 0, 10);
        assert.equal(result.releaseGroups.length, 1);
        assert.deepEqual(result.releaseGroups[0]?.['artist-credit'], []);
        assert.equal(result.releaseGroups[0]?.['primary-type'], null);
    });

    it('rejects malformed top-level responses after retry exhaustion', async () => {
        installResponse({ count: 1, 'release-groups': null });
        await assert.rejects(
            searchReleaseGroups('user-1', 'test', 0, 10),
            /invalid release-group search response/,
        );
    });
});

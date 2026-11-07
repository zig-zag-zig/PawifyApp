import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    createSearchWithZeroResultFallback,
    type SearchWithApiFallbackDependencies,
} from '../../../src/services/search/zeroResultApiFallback.js';

const build = (overrides: Partial<SearchWithApiFallbackDependencies> = {}) => {
    const calls = { mirrorArtists: 0, mirrorRgs: 0, apiArtists: 0, apiRgs: 0, cacheWrites: 0 };
    const cache = new Map<string, unknown>();

    const gateway = createSearchWithZeroResultFallback({
        searchArtistsFromMirror: () => {
            calls.mirrorArtists += 1;
            return { artists: [{ id: 'mirror-1', name: 'Mirror Artist' }], count: 1 };
        },
        searchReleaseGroupsFromMirror: () => {
            calls.mirrorRgs += 1;
            return {
                releaseGroups: [
                    {
                        id: 'mirror-rg-1',
                        title: 'Mirror Album',
                        'primary-type': 'Album',
                        'first-release-date': '2020',
                        'artist-credit': [],
                    },
                ],
                count: 1,
            };
        },
        searchArtistsFromApi: async () => {
            calls.apiArtists += 1;
            return { artists: [{ id: 'api-1', name: 'The Beatles' }], count: 1 };
        },
        searchReleaseGroupsFromApi: async () => {
            calls.apiRgs += 1;
            return {
                releaseGroups: [
                    {
                        id: 'api-rg-1',
                        title: 'Abbey Road',
                        'primary-type': 'Album',
                        'first-release-date': '1969',
                        'artist-credit': [],
                    },
                ],
                count: 1,
            };
        },
        readCache: async <T>(key: string) => (cache.get(key) as T | undefined) ?? null,
        writeCache: async <T>(key: string, value: T) => {
            calls.cacheWrites += 1;
            cache.set(key, value);
        },
        ...overrides,
    });

    return { gateway, calls };
};

describe('zero-result search API fallback', () => {
    it('returns non-empty local mirror results without calling the API', async () => {
        const { gateway, calls } = build();

        const artists = await gateway.searchArtists('u1', 'radiohead', 0, 100);
        const groups = await gateway.searchReleaseGroups('u1', 'ok computer', 0, 100);

        assert.equal(artists.artists[0]?.id, 'mirror-1');
        assert.equal(groups.releaseGroups[0]?.id, 'mirror-rg-1');
        assert.equal(calls.apiArtists, 0);
        assert.equal(calls.apiRgs, 0);
    });

    it('falls back to MusicBrainz API and caches for 1h when local mirror returns 0 rows (typo)', async () => {
        const { gateway, calls } = build({
            searchArtistsFromMirror: () => ({ artists: [], count: 0 }),
            searchReleaseGroupsFromMirror: () => ({ releaseGroups: [], count: 0 }),
        });

        const first = await gateway.searchArtists('u1', 'bealtes', 0, 100);
        const second = await gateway.searchArtists('u1', 'BEALTES ', 0, 100);
        const rg = await gateway.searchReleaseGroups('u1', 'metallcia', 0, 100);

        assert.equal(first.artists[0]?.id, 'api-1');
        assert.equal(second.artists[0]?.id, 'api-1');
        assert.equal(rg.releaseGroups[0]?.id, 'api-rg-1');
        assert.equal(calls.apiArtists, 1, 'second call must hit Redis cache');
        assert.equal(calls.apiRgs, 1);
        assert.equal(calls.cacheWrites, 2);
    });

    it('does not call the API when paging past the end of a non-empty local result set', async () => {
        const { gateway, calls } = build({
            searchArtistsFromMirror: () => ({ artists: [], count: 15 }),
        });

        const result = await gateway.searchArtists('u1', 'radiohead', 100, 100);

        assert.deepEqual(result, { artists: [], count: 15 });
        assert.equal(calls.apiArtists, 0);
    });

    it('returns empty local result instead of throwing if typo API fallback fails', async () => {
        const { gateway } = build({
            searchArtistsFromMirror: () => ({ artists: [], count: 0 }),
            searchArtistsFromApi: async () => {
                throw new Error('503 Service Unavailable');
            },
        });

        const result = await gateway.searchArtists('u1', 'bealtes', 0, 100);
        assert.deepEqual(result, { artists: [], count: 0 });
    });

    it('returns empty immediately without calling mirror or API when query has no tokens', async () => {
        const { gateway, calls } = build();

        assert.deepEqual(await gateway.searchArtists('u1', '   !!!  ', 0, 100), {
            artists: [],
            count: 0,
        });
        assert.equal(calls.mirrorArtists, 0);
        assert.equal(calls.apiArtists, 0);
    });
});

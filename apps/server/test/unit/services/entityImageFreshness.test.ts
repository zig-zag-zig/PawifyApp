import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    ARTIST_IMAGE_MAX_AGE_MS,
    CONFIRMED_MISS_MAX_AGE_MS,
    resolveEntityImageFreshness,
} from '../../../src/services/musicApi/entityImageFreshness.js';

const now = Date.UTC(2026, 0, 31, 12, 0, 0);
const secondsAgo = (ms: number) => (now - ms) / 1000;

describe('entity image freshness', () => {
    it('treats pending and absent rows as live work', () => {
        assert.equal(resolveEntityImageFreshness('artist', null, now), null);
        assert.equal(
            resolveEntityImageFreshness('artist', { service: 'pending', fetchedAt: 0 }, now),
            null,
        );
    });

    it('serves release artwork permanently', () => {
        for (const service of ['caa_rel', 'caa_rg', 'deezer', 'tidal']) {
            const freshness = resolveEntityImageFreshness(
                'release',
                { service, fetchedAt: secondsAgo(400 * 24 * 60 * 60 * 1000) },
                now,
            );
            assert.deepEqual(
                freshness,
                { immediate: true, revalidate: false, settlePermanent: false },
                `${service} must never be re-fetched by timer`,
            );
        }
    });

    it('revalidates a stale artist portrait but still answers immediately', () => {
        const fresh = resolveEntityImageFreshness(
            'artist',
            { service: 'deezer', fetchedAt: secondsAgo(ARTIST_IMAGE_MAX_AGE_MS - 60_000) },
            now,
        );
        assert.deepEqual(fresh, { immediate: true, revalidate: false, settlePermanent: false });

        const stale = resolveEntityImageFreshness(
            'artist',
            { service: 'deezer', fetchedAt: secondsAgo(ARTIST_IMAGE_MAX_AGE_MS + 60_000) },
            now,
        );
        assert.deepEqual(stale, { immediate: true, revalidate: true, settlePermanent: false });
    });

    it('keeps a dump-derived miss permanent and re-checks a provider miss after a day', () => {
        assert.deepEqual(
            resolveEntityImageFreshness('release', { service: 'none', fetchedAt: 0 }, now),
            { immediate: true, revalidate: false, settlePermanent: false },
        );

        const recent = resolveEntityImageFreshness(
            'release',
            { service: 'none', fetchedAt: secondsAgo(CONFIRMED_MISS_MAX_AGE_MS - 60_000) },
            now,
        );
        assert.deepEqual(recent, { immediate: true, revalidate: false, settlePermanent: false });

        const stale = resolveEntityImageFreshness(
            'release',
            { service: 'none', fetchedAt: secondsAgo(CONFIRMED_MISS_MAX_AGE_MS + 60_000) },
            now,
        );
        assert.deepEqual(stale, { immediate: true, revalidate: true, settlePermanent: false });

        const veryStale = resolveEntityImageFreshness(
            'release',
            { service: 'none', fetchedAt: secondsAgo(30 * 24 * 60 * 60 * 1000) },
            now,
        );
        assert.deepEqual(veryStale, { immediate: true, revalidate: true, settlePermanent: true });
    });
});

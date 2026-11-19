import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installModuleFake } from '../../helpers/moduleFakes.js';
import { collectPrunedNewReleaseIds } from '../../../src/services/firebase/newReleasePruning.js';
import { toPublicNewRelease } from '../../../src/services/firebase/newReleaseSerialization.js';
import type { StoredNewRelease } from '../../../src/services/firebase/types.js';

installModuleFake('../../src/infrastructure/firebase/firebaseInit.js', {
    db: {},
    rtdb: {},
});

let storedNewReleasesDocument: unknown = {};
const fakeNewReleasesDocRef = {
    get: async () => ({ data: () => storedNewReleasesDocument }),
    set: async (value: unknown) => {
        storedNewReleasesDocument = value;
    },
};
installModuleFake('../../src/services/firebase/refs.js', {
    getNewReleasesMapDocRef: () => fakeNewReleasesDocRef,
    buildNewReleasesCollectionPayload: (value: unknown) => value,
});
installModuleFake('../../src/services/monitoring/mapsDocSizeMonitor.js', {
    monitorUserMapsDocSizes: async () => undefined,
});

const storedEntry = (overrides: Partial<StoredNewRelease> = {}): StoredNewRelease => ({
    id: 'release-1',
    title: 'Album',
    date: '2026-01-01',
    disambiguation: null,
    artists: { 'artist-1': 'Artist' },
    date_for_display: '01.01.2026',
    'primary-type': 'Album',
    releaseGroupId: 'group-1',
    releaseCount: 2,
    trackCount: 18,
    editionKeywords: ['deluxe'],
    notificationReason: 'new-edition',
    ...overrides,
});

describe('toPublicNewRelease', () => {
    it('keeps group identity and content-event metadata in the public feed', () => {
        const publicRelease = toPublicNewRelease(storedEntry());

        assert.equal(publicRelease.releaseGroupId, 'group-1');
        assert.equal(publicRelease.releaseCount, 2);
        assert.equal(publicRelease.trackCount, 18);
        assert.deepEqual(publicRelease.editionKeywords, ['deluxe']);
        assert.equal(publicRelease.notificationReason, 'new-edition');
    });
});

describe('stored feed normalization', () => {
    it('preserves group count and event metadata through the real read path', async () => {
        const { normalizeNewReleasesCollectionDocument } = await import(
            '../../../src/services/firebase/newReleasesStore.js'
        );
        const normalized = normalizeNewReleasesCollectionDocument({
            'release-1': {
                ...storedEntry({ releaseCount: 3 }),
            },
        });

        const entry = normalized?.['release-1'];
        assert.equal(entry?.releaseCount, 3);
        assert.equal(entry?.releaseGroupId, 'group-1');
        assert.equal(entry?.trackCount, 18);
        assert.deepEqual(entry?.editionKeywords, ['deluxe']);
        assert.equal(entry?.notificationReason, 'new-edition');
        assert.equal(toPublicNewRelease(entry!).releaseCount, 3);
    });

    it('derives an ISO date from the stored display value when date is absent', async () => {
        const { normalizeNewReleasesCollectionDocument } = await import(
            '../../../src/services/firebase/newReleasesStore.js'
        );
        const legacy = storedEntry({ date: null, date_for_display: '10.02.2026' });

        const normalized = normalizeNewReleasesCollectionDocument({ 'release-1': legacy });

        assert.equal(normalized?.['release-1']?.date, '2026-02-10');
    });

    it('leaves a historical entry without a count absent', async () => {
        const { normalizeNewReleasesCollectionDocument } = await import(
            '../../../src/services/firebase/newReleasesStore.js'
        );
        const legacy = storedEntry();
        delete (legacy as Partial<StoredNewRelease>).releaseCount;
        const normalized = normalizeNewReleasesCollectionDocument({ 'release-1': legacy });

        assert.equal('releaseCount' in (normalized?.['release-1'] ?? {}), false);
    });
});

describe('Firebase-backed snapshot read', () => {
    it('preserves group identity through the Firebase-backed snapshot read', async () => {
        storedNewReleasesDocument = {
            'release-1': {
                ...storedEntry({ releaseCount: 3 }),
            },
        };
        const { getNewReleasesSnapshotFromDb } = await import(
            '../../../src/services/firebase/newReleasesStore.js'
        );

        const snapshot = await getNewReleasesSnapshotFromDb('user-1');
        const entry = snapshot.newReleasesMap['release-1'];

        assert.equal(entry?.releaseCount, 3);
        assert.equal(entry?.releaseGroupId, 'group-1');
        assert.equal(entry?.notificationReason, 'new-edition');
        assert.deepEqual(entry?.editionKeywords, ['deluxe']);
        assert.equal(entry?.trackCount, 18);
    });

});

describe('collectPrunedNewReleaseIds', () => {
    const knownStatesByArtist = {
        'artist-1': {
            'group-a': {
                lastNotifiedDate: null,
                maxOfficialTrackCount: 12,
                editionKeywords: [],
            },
        },
    };

    it('removes a group entry for a pruned group', () => {
        const ids = collectPrunedNewReleaseIds({
            newReleasesMap: { 'release-1': { id: 'release-1', releaseGroupId: 'group-gone' } },
            knownStatesByArtist,
            prunedGroupIds: ['group-gone'],
        });

        assert.deepEqual(ids, ['release-1']);
    });

    it('keeps an entry whose group is still known under another artist', () => {
        const ids = collectPrunedNewReleaseIds({
            newReleasesMap: { 'release-1': { id: 'release-1', releaseGroupId: 'group-a' } },
            knownStatesByArtist,
            prunedGroupIds: ['group-a'],
        });

        assert.deepEqual(ids, []);
    });
});
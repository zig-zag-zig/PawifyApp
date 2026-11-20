import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { buildKnownReleaseGroupStatePayload, normalizeKnownReleaseGroupStateWithStatus } from '../../src/services/firebase/knownReleaseStateNormalization.js';

it('retains empty known-release baselines in the RTDB wire format', { skip: !process.env.FIREBASE_DATABASE_EMULATOR_HOST }, async () => {
    const app = initializeApp({ projectId: 'pawify-test', databaseURL: 'https://pawify-test.firebaseio.com' }, randomUUID());
    const ref = getDatabase(app).ref('knownReleaseRoundTrip').push();
    try {
        const baseline = { lastNotifiedDate: null, maxOfficialTrackCount: null, editionKeywords: [] };
        await ref.set({ artist: buildKnownReleaseGroupStatePayload(new Map([['group', baseline]])) });
        const state = normalizeKnownReleaseGroupStateWithStatus((await ref.get()).val());
        assert.equal(state.hasUnmigratedValues, false);
        assert.deepEqual(state.state.artist.group, baseline);
    } finally {
        await ref.remove();
        await deleteApp(app);
    }
});

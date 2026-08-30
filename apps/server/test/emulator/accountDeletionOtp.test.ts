/**
 * Emulator test for account deletion (production deleteUserAccount).
 * Requires: FIREBASE_AUTH_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST, FIREBASE_DATABASE_EMULATOR_HOST.
 * When emulators are absent, all tests are skipped.
 *
 * NOTE: OTP sendOtp/verifyOtp behavior is covered at the SERVICE UNIT layer in
 * test/unit/services/passwordResetOtpService.test.ts (faked firebaseInit +
 * emailService, real service code), because firebase-admin v14's getUserByEmail
 * does not resolve against the Auth emulator reliably under the
 * firebase-tools emulators:exec harness (getUser(uid) does work, which is why
 * this deletion test passes).
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getDatabase, type Database } from 'firebase-admin/database';

const EMULATOR = Boolean(
    process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    process.env.FIRESTORE_EMULATOR_HOST &&
    process.env.FIREBASE_DATABASE_EMULATOR_HOST,
);

let app: App;
let auth: Auth;
let db: Firestore;
let rtdb: Database;
let deleteUserAccount: (userId: string) => Promise<void>;

before(async () => {
    if (!EMULATOR) return;
    const existing = getApps();
    app =
        existing.length > 0
            ? existing[0]
            : initializeApp({
                  projectId: 'pawify-test',
                  databaseURL: 'http://127.0.0.1:9000/?ns=pawify-test',
              });
    auth = getAuth(app);
    db = getFirestore(app);
    rtdb = getDatabase(app);
    // Lazy import so the firebaseInit module-load throw does not crash this file
    // in non-emulator (unit) test runs.
    const userStore = await import('../../src/services/firebase/userStore.js');
    deleteUserAccount = userStore.deleteUserAccount;
});

after(async () => {
    if (app) await deleteApp(app).catch(() => {});
});

describe('account deletion (production deleteUserAccount)', { skip: !EMULATOR }, () => {
    it('recursively deletes Firestore user doc + subcollections, knownReleases, passwordResets', async () => {
        const user = await auth.createUser({
            email: `del-${Date.now()}@example.com`,
            password: 'password123',
        });
        const userId = user.uid;
        const userRef = db.collection('users').doc(userId);
        await userRef.set({ createdAt: new Date() });
        // Subcollections that origin/main's top-level .delete() would orphan.
        await userRef.collection('followingArtists').doc('a1').set({ id: 'a1', name: 'A' });
        await userRef
            .collection('newReleases')
            .doc('maps')
            .set({ rel1: { id: 'rel1', title: 'T' } });
        await db.collection('passwordResets').doc(userId).set({ otpHash: 'x', attempts: 0 });
        await rtdb.ref(`knownReleases/${userId}`).set({ a1: { rel1: true } });

        await deleteUserAccount(userId);

        // Auth user gone.
        await assert.rejects(
            () => auth.getUser(userId),
            (e: unknown) => (e as { code?: string }).code === 'auth/user-not-found',
        );
        // Top-level doc gone.
        assert.ok(!(await userRef.get()).exists);
        // Subcollections gone (the original origin/main bug).
        assert.equal(
            (await userRef.collection('followingArtists').get()).size,
            0,
            'followingArtists subcollection deleted',
        );
        assert.equal(
            (await userRef.collection('newReleases').get()).size,
            0,
            'newReleases subcollection deleted',
        );
        // passwordResets gone.
        assert.ok(!(await db.collection('passwordResets').doc(userId).get()).exists);
        // knownReleases gone.
        assert.equal((await rtdb.ref(`knownReleases/${userId}`).get()).val(), null);
    });

    it('is idempotent: calling again on an already-deleted user does not throw', async () => {
        const user = await auth.createUser({
            email: `idem-${Date.now()}@example.com`,
            password: 'password123',
        });
        const userId = user.uid;
        await db.collection('users').doc(userId).set({ createdAt: new Date() });

        await deleteUserAccount(userId);
        // Second call must not throw (user-not-found is handled at every step).
        await deleteUserAccount(userId);
    });
});

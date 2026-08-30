import { db } from '../../infrastructure/firebase/firebaseInit.js';
import type { DocumentReference, CollectionReference, WriteBatch } from 'firebase-admin/firestore';
import type { FollowingArtistsMap, StoredNewReleasesMap } from './types.js';
import { makeDeepCopy } from './utils.js';

const FOLLOWING_SUBCOLLECTION = 'followingArtists';
export const NEW_RELEASES_SUBCOLLECTION = 'newReleases';
const MAP_DOC_ID = 'maps';
const BATCH_WRITE_LIMIT = 450;

export const getUserRef = (userId: string): DocumentReference => db.collection('users').doc(userId);

const getFollowingCollectionRef = (userId: string): CollectionReference =>
    getUserRef(userId).collection(FOLLOWING_SUBCOLLECTION);

export const getFollowingMapDocRef = (userId: string): DocumentReference =>
    getFollowingCollectionRef(userId).doc(MAP_DOC_ID);

const getNewReleasesCollectionRef = (userId: string): CollectionReference =>
    getUserRef(userId).collection(NEW_RELEASES_SUBCOLLECTION);

export const getNewReleasesMapDocRef = (userId: string): DocumentReference =>
    getNewReleasesCollectionRef(userId).doc(MAP_DOC_ID);

export const buildFollowingCollectionPayload = (
    artistsMap: FollowingArtistsMap,
): FollowingArtistsMap => makeDeepCopy(artistsMap);

export const buildNewReleasesCollectionPayload = (
    newReleasesMap: StoredNewReleasesMap,
): StoredNewReleasesMap => makeDeepCopy(newReleasesMap);

export const commitBatchMutations = async (
    mutations: Array<(batch: WriteBatch) => void>,
): Promise<void> => {
    if (mutations.length === 0) {
        return;
    }

    for (let offset = 0; offset < mutations.length; offset += BATCH_WRITE_LIMIT) {
        const batch = db.batch();
        for (const mutation of mutations.slice(offset, offset + BATCH_WRITE_LIMIT)) {
            mutation(batch);
        }
        await batch.commit();
    }
};

import { db } from '../../infrastructure/firebase/firebaseInit.js';
import type { WriteBatch } from 'firebase-admin/firestore';
import type { MissingReleaseCleanupResult } from './types.js';
import {
    NEW_RELEASES_SUBCOLLECTION,
    buildNewReleasesCollectionPayload,
    commitBatchMutations,
} from './refs.js';
import { removeKnownReleaseFromAllUsers } from './knownReleasesStore.js';
import {
    normalizeNewReleasesCollectionDocument,
    removeNewReleaseFromMap,
} from './newReleasesStore.js';
import { getParentUserIdFromSubcollectionDocument } from './utils.js';

export const removeReleaseFromAllUserDocuments = async (
    releaseId: string,
): Promise<MissingReleaseCleanupResult> => {
    if (!releaseId) {
        throw new Error('Invalid input: releaseId is required.');
    }

    const affectedUserIds = new Set<string>();
    const removedFromNewReleasesUserIds = new Set<string>();

    for (const affectedUserId of await removeKnownReleaseFromAllUsers(releaseId)) {
        affectedUserIds.add(affectedUserId);
    }

    const newReleaseMatches = await db.collectionGroup(NEW_RELEASES_SUBCOLLECTION).get();

    const newReleaseMutations: Array<(batch: WriteBatch) => void> = [];
    for (const newReleaseDocument of newReleaseMatches.docs) {
        const normalized = normalizeNewReleasesCollectionDocument(newReleaseDocument.data());
        if (!normalized) {
            continue;
        }

        const updatedMap = removeNewReleaseFromMap(normalized, releaseId);
        const previousReleaseCount = Object.keys(normalized).length;
        const nextReleaseCount = Object.keys(updatedMap).length;
        const hasChanged = previousReleaseCount !== nextReleaseCount;
        if (!hasChanged) {
            continue;
        }

        const userId = getParentUserIdFromSubcollectionDocument(newReleaseDocument.ref);
        if (userId) {
            affectedUserIds.add(userId);
            removedFromNewReleasesUserIds.add(userId);
        }

        newReleaseMutations.push((batch) => {
            batch.set(newReleaseDocument.ref, buildNewReleasesCollectionPayload(updatedMap));
        });
    }

    await commitBatchMutations(newReleaseMutations);

    return {
        affectedUserIds: Array.from(affectedUserIds),
        removedFromNewReleasesUserIds: Array.from(removedFromNewReleasesUserIds),
    };
};

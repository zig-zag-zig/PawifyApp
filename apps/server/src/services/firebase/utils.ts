import type { DocumentReference } from 'firebase-admin/firestore';

export const makeDeepCopy = <T>(data: T): T => JSON.parse(JSON.stringify(data));

export const getParentUserIdFromSubcollectionDocument = (
    documentReference: DocumentReference,
): string | null => {
    return documentReference.parent.parent?.id ?? null;
};

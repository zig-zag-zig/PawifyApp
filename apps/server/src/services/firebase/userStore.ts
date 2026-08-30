import { UserRecord } from 'firebase-admin/auth';
import type { DocumentData, DocumentReference } from 'firebase-admin/firestore';
import { auth, db, rtdb } from '../../infrastructure/firebase/firebaseInit.js';
import { RequestWithAuthHeader, UNAUTH_MESSAGE } from './types.js';
import { getUserRef } from './refs.js';
import { deleteUserPushTokensFromDb } from './pushTokenStore.js';

/**
 * Returns the user document's data and reference.
 *
 * Read side effect: when no user document exists yet, an empty document is
 * created before the data is returned — any settings read through this
 * helper auto-creates the user document.
 */
export const getDocumentRefAndSnapshot = async (
    userId: string,
): Promise<{ snapShot: DocumentData; ref: DocumentReference }> => {
    if (!userId) {
        throw new Error('Invalid input: userId is required.');
    }

    const ref = getUserRef(userId);
    const documentSnapshot = await ref.get();

    if (!documentSnapshot.exists) {
        const defaultData = {};

        await ref.set(defaultData);
        return { snapShot: defaultData, ref };
    }

    const snapShot = documentSnapshot.data();

    if (!snapShot) {
        throw new Error(`Failed to retrieve data for user ${userId}`);
    }

    return { snapShot, ref };
};

export const checkAuth = async (req: RequestWithAuthHeader): Promise<string> => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        throw new Error(UNAUTH_MESSAGE);
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const decodedToken = await auth.verifyIdToken(token, true);
        return decodedToken.uid;
    } catch {
        throw new Error(UNAUTH_MESSAGE);
    }
};

export const getAllUsers = async (): Promise<UserRecord[]> => {
    let users: UserRecord[] = [];
    let nextPageToken: string | undefined;

    do {
        const result = await auth.listUsers(1000, nextPageToken);
        users = users.concat(result.users);
        nextPageToken = result.pageToken;
    } while (nextPageToken);

    return users;
};

export const deleteUserAccount = async (userId: string): Promise<void> => {
    if (!userId) {
        throw new Error('Invalid input: userId is required.');
    }

    // Step 1: Revoke refresh tokens + disable user. MUST succeed before any
    // destructive cleanup runs, otherwise a live account could have its data
    // destroyed. auth/user-not-found means the account is already gone.
    try {
        await auth.revokeRefreshTokens(userId);
        await auth.updateUser(userId, { disabled: true });
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        const authErrorCode = (err as { code?: string })?.code ?? '';
        if (authErrorCode !== 'auth/user-not-found') {
            throw err;
        }
        // Account already gone — clean up residual data best-effort, then return.
        await cleanupUserDataBestEffort(userId);
        return;
    }

    // Step 2: Account is now disabled. Run cleanup (each step idempotent).
    const cleanupErrors: Error[] = [];
    await runCleanupSteps(userId, cleanupErrors);

    // Step 3: If any cleanup failed, the user is disabled but data is partial.
    // Re-enable the account so the user can sign in and retry. Surface the error.
    if (cleanupErrors.length > 0) {
        // Retry re-enable a few times — a transient failure here must not strand
        // the account disabled. If it truly cannot re-enable, throw THAT error
        // so it is surfaced and retried rather than silently stranding the user.
        let reEnableError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                await auth.updateUser(userId, { disabled: false });
                reEnableError = null;
                break;
            } catch (error: unknown) {
                reEnableError = error instanceof Error ? error : new Error(String(error));
                await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
            }
        }
        throw reEnableError ?? cleanupErrors[0];
    }

    // Step 4: Cleanup succeeded — delete the Auth user.
    try {
        await auth.deleteUser(userId);
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        const authErrorCode = (err as { code?: string })?.code ?? '';
        if (authErrorCode !== 'auth/user-not-found') {
            // Data is gone but Auth deletion failed. The account is disabled (from
            // step 1). Re-enable so the user can at least sign in. Apply the same
            // retry-and-surface policy as cleanup-failure rollback so a transient
            // Auth error cannot strand the account disabled. If re-enable truly
            // cannot succeed, surface THAT error so it is retried.
            let reEnableError: unknown = null;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    await auth.updateUser(userId, { disabled: false });
                    reEnableError = null;
                    break;
                } catch (reEnableUnknown: unknown) {
                    reEnableError =
                        reEnableUnknown instanceof Error
                            ? reEnableUnknown
                            : new Error(String(reEnableUnknown));
                    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
                }
            }
            throw reEnableError ?? err;
        }
    }
};

const runCleanupSteps = async (userId: string, errors: Error[]): Promise<void> => {
    const recordError = (error: unknown) => {
        errors.push(error instanceof Error ? error : new Error(String(error)));
    };
    try {
        await db.recursiveDelete(getUserRef(userId));
    } catch (error: unknown) {
        recordError(error);
    }
    try {
        await rtdb.ref('knownReleases/' + userId).remove();
    } catch (error: unknown) {
        recordError(error);
    }
    try {
        await db.collection('passwordResets').doc(userId).delete();
    } catch (error: unknown) {
        recordError(error);
    }
    try {
        await deleteUserPushTokensFromDb(userId);
    } catch (error: unknown) {
        recordError(error);
    }
};

const cleanupUserDataBestEffort = async (userId: string): Promise<void> => {
    const ignored: Error[] = [];
    await runCleanupSteps(userId, ignored);
};

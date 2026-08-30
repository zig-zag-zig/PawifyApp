import { rtdb } from '../../infrastructure/firebase/firebaseInit.js';
import { assertRtdbKey, decodeRtdbKeySegment, encodeRtdbKeySegment } from './rtdbKeys.js';
import {
    DEVICE_PUSH_TOKENS_ROOT,
    PUSH_TOKENS_ROOT,
    USER_PUSH_DEVICES_ROOT,
    cleanupPreviousDeviceAssignment,
    cleanupPreviousTokenAssignment,
    getDevicePushTokenAssignment,
    getPushTokenAssignment,
    getUserPushDeviceRef,
    getUserPushDevicesRef,
    isCurrentAssignment,
    normalizeDeviceId,
    normalizePushToken,
    normalizePushTokens,
    readUserDevicePushTokenEntries,
    removeDevicePushTokenAssignmentIfMatches,
    removePushTokenAssignmentIfMatches,
    removeStaleUserPushDeviceIndex,
    removeUserPushDeviceIndexIfMatches,
    type DevicePushTokenAssignment,
    type PushTokenAssignment,
} from './pushTokenAssignments.js';

export const getPushTokensFromDb = async (userId: string): Promise<string[]> => {
    assertRtdbKey('userId', userId);

    const entries = await readUserDevicePushTokenEntries(userId);
    const pushTokens: string[] = [];

    for (const { encodedDeviceId, encodedPushToken } of entries) {
        const pushToken = decodeRtdbKeySegment(encodedPushToken);
        if (!pushToken || !(await isCurrentAssignment(userId, encodedDeviceId, encodedPushToken))) {
            await removeStaleUserPushDeviceIndex(userId, encodedDeviceId, encodedPushToken);
            continue;
        }

        pushTokens.push(pushToken);
    }

    return Array.from(new Set(pushTokens));
};

export const savePushTokenToDb = async (
    userId: string,
    deviceId: string,
    pushToken: string,
): Promise<void> => {
    assertRtdbKey('userId', userId);

    const normalizedDeviceId = normalizeDeviceId(deviceId);
    const normalizedPushToken = normalizePushToken(pushToken);
    if (!normalizedPushToken) {
        return;
    }

    const encodedDeviceId = encodeRtdbKeySegment(normalizedDeviceId);
    const encodedPushToken = encodeRtdbKeySegment(normalizedPushToken);
    const [previousDeviceAssignment, previousTokenAssignment] = await Promise.all([
        getDevicePushTokenAssignment(encodedDeviceId),
        getPushTokenAssignment(encodedPushToken),
    ]);

    await rtdb.ref().update({
        [`${PUSH_TOKENS_ROOT}/${encodedPushToken}`]: {
            userId,
            deviceId: normalizedDeviceId,
        } satisfies PushTokenAssignment,
        [`${DEVICE_PUSH_TOKENS_ROOT}/${encodedDeviceId}`]: {
            userId,
            pushToken: encodedPushToken,
        } satisfies DevicePushTokenAssignment,
        [`${USER_PUSH_DEVICES_ROOT}/${userId}/${encodedDeviceId}`]: encodedPushToken,
    });

    await Promise.all([
        cleanupPreviousDeviceAssignment(
            encodedDeviceId,
            previousDeviceAssignment,
            userId,
            encodedPushToken,
        ),
        cleanupPreviousTokenAssignment(
            encodedPushToken,
            previousTokenAssignment,
            userId,
            normalizedDeviceId,
        ),
    ]);
};

export const deleteDevicePushTokenFromDb = async (
    userId: string,
    deviceId: string,
): Promise<void> => {
    assertRtdbKey('userId', userId);

    const normalizedDeviceId = normalizeDeviceId(deviceId);
    const encodedDeviceId = encodeRtdbKeySegment(normalizedDeviceId);
    const deviceAssignment = await getDevicePushTokenAssignment(encodedDeviceId);
    const userDeviceSnapshot = await getUserPushDeviceRef(userId, encodedDeviceId).get();
    const indexedPushToken =
        typeof userDeviceSnapshot.val() === 'string' ? userDeviceSnapshot.val() : undefined;
    const encodedPushToken =
        deviceAssignment?.userId === userId ? deviceAssignment.pushToken : indexedPushToken;

    if (!encodedPushToken) {
        return;
    }

    if (!decodeRtdbKeySegment(encodedPushToken)) {
        await removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken);
        return;
    }

    await Promise.all([
        removePushTokenAssignmentIfMatches(encodedPushToken, {
            userId,
            deviceId: normalizedDeviceId,
        }),
        removeDevicePushTokenAssignmentIfMatches(encodedDeviceId, {
            userId,
            pushToken: encodedPushToken,
        }),
        removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken),
    ]);
};

export const deletePushTokensFromDb = async (
    userId: string,
    pushTokens: string[],
): Promise<void> => {
    assertRtdbKey('userId', userId);

    const normalizedPushTokens = normalizePushTokens(pushTokens);
    if (normalizedPushTokens.length === 0) {
        return;
    }

    await Promise.all(
        normalizedPushTokens.map(async (pushToken) => {
            const encodedPushToken = encodeRtdbKeySegment(pushToken);
            const pushTokenAssignment = await getPushTokenAssignment(encodedPushToken);
            if (pushTokenAssignment?.userId !== userId) {
                return;
            }

            const encodedDeviceId = encodeRtdbKeySegment(pushTokenAssignment.deviceId);
            await Promise.all([
                removePushTokenAssignmentIfMatches(encodedPushToken, pushTokenAssignment),
                removeDevicePushTokenAssignmentIfMatches(encodedDeviceId, {
                    userId,
                    pushToken: encodedPushToken,
                }),
                removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken),
            ]);
        }),
    );
};

export const deleteUserPushTokensFromDb = async (userId: string): Promise<void> => {
    assertRtdbKey('userId', userId);

    const entries = await readUserDevicePushTokenEntries(userId);
    await Promise.all(
        entries.map(async ({ encodedDeviceId }) => {
            const deviceId = decodeRtdbKeySegment(encodedDeviceId);
            if (deviceId) {
                await deleteDevicePushTokenFromDb(userId, deviceId);
            }
        }),
    );

    await getUserPushDevicesRef(userId).remove();
};

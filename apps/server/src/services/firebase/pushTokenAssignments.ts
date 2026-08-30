import { rtdb } from '../../infrastructure/firebase/firebaseInit.js';
import { assertRtdbKey, decodeRtdbKeySegment, encodeRtdbKeySegment } from './rtdbKeys.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';

export const PUSH_TOKENS_ROOT = 'pushTokens';
export const DEVICE_PUSH_TOKENS_ROOT = 'devicePushTokens';
export const USER_PUSH_DEVICES_ROOT = 'userPushDevices';

export type PushTokenAssignment = {
    userId: string;
    deviceId: string;
};

export type DevicePushTokenAssignment = {
    userId: string;
    pushToken: string;
};

export type UserDevicePushTokenEntry = {
    encodedDeviceId: string;
    encodedPushToken: string;
};

export const normalizePushToken = (pushToken: string): string | null => {
    const trimmed = pushToken.trim();
    return trimmed.length > 0 ? trimmed : null;
};

export const normalizePushTokens = (pushTokens: string[]): string[] =>
    Array.from(
        new Set(
            pushTokens.flatMap((token) => {
                const normalized = normalizePushToken(token);
                return normalized ? [normalized] : [];
            }),
        ),
    );

export const normalizeDeviceId = (deviceId: string): string => {
    const normalized = deviceId.trim();
    if (!normalized) {
        throw new Error('Invalid input: deviceId is required.');
    }

    return normalized;
};

const assertEncodedPushToken = (encodedPushToken: string): void => {
    assertRtdbKey('encodedPushToken', encodedPushToken);
};

const assertEncodedDeviceId = (encodedDeviceId: string): void => {
    assertRtdbKey('encodedDeviceId', encodedDeviceId);
};

const getPushTokenAssignmentRef = (encodedPushToken: string) => {
    assertEncodedPushToken(encodedPushToken);
    return rtdb.ref(`${PUSH_TOKENS_ROOT}/${encodedPushToken}`);
};

const getDevicePushTokenAssignmentRef = (encodedDeviceId: string) => {
    assertEncodedDeviceId(encodedDeviceId);
    return rtdb.ref(`${DEVICE_PUSH_TOKENS_ROOT}/${encodedDeviceId}`);
};

export const getUserPushDevicesRef = (userId: string) => {
    assertRtdbKey('userId', userId);
    return rtdb.ref(`${USER_PUSH_DEVICES_ROOT}/${userId}`);
};

export const getUserPushDeviceRef = (userId: string, encodedDeviceId: string) => {
    assertRtdbKey('userId', userId);
    assertEncodedDeviceId(encodedDeviceId);
    return rtdb.ref(`${USER_PUSH_DEVICES_ROOT}/${userId}/${encodedDeviceId}`);
};

const isPushTokenAssignment = (value: unknown): value is PushTokenAssignment =>
    isPlainObject(value) &&
    typeof value.userId === 'string' &&
    value.userId.trim().length > 0 &&
    typeof value.deviceId === 'string' &&
    value.deviceId.trim().length > 0;

const isDevicePushTokenAssignment = (value: unknown): value is DevicePushTokenAssignment =>
    isPlainObject(value) &&
    typeof value.userId === 'string' &&
    value.userId.trim().length > 0 &&
    typeof value.pushToken === 'string' &&
    value.pushToken.trim().length > 0;

export const getPushTokenAssignment = async (
    encodedPushToken: string,
): Promise<PushTokenAssignment | null> => {
    const snapshot = await getPushTokenAssignmentRef(encodedPushToken).get();
    const assignment = snapshot.val();
    return isPushTokenAssignment(assignment) ? assignment : null;
};

export const getDevicePushTokenAssignment = async (
    encodedDeviceId: string,
): Promise<DevicePushTokenAssignment | null> => {
    const snapshot = await getDevicePushTokenAssignmentRef(encodedDeviceId).get();
    const assignment = snapshot.val();
    return isDevicePushTokenAssignment(assignment) ? assignment : null;
};

export const readUserDevicePushTokenEntries = async (
    userId: string,
): Promise<UserDevicePushTokenEntry[]> => {
    const snapshot = await getUserPushDevicesRef(userId).get();
    const value = snapshot.val();
    if (!isPlainObject(value)) {
        return [];
    }

    return Object.entries(value).flatMap(([encodedDeviceId, encodedPushToken]) => {
        assertEncodedDeviceId(encodedDeviceId);
        if (typeof encodedPushToken !== 'string') {
            return [];
        }

        return [{ encodedDeviceId, encodedPushToken }];
    });
};

const pushTokenAssignmentMatches = (assignment: unknown, expected: PushTokenAssignment): boolean =>
    isPushTokenAssignment(assignment) &&
    assignment.userId === expected.userId &&
    assignment.deviceId === expected.deviceId;

const devicePushTokenAssignmentMatches = (
    assignment: unknown,
    expected: DevicePushTokenAssignment,
): boolean =>
    isDevicePushTokenAssignment(assignment) &&
    assignment.userId === expected.userId &&
    assignment.pushToken === expected.pushToken;

export const removePushTokenAssignmentIfMatches = async (
    encodedPushToken: string,
    expected: PushTokenAssignment,
): Promise<void> => {
    await getPushTokenAssignmentRef(encodedPushToken).transaction((current: unknown) =>
        pushTokenAssignmentMatches(current, expected) ? null : current,
    );
};

export const removeDevicePushTokenAssignmentIfMatches = async (
    encodedDeviceId: string,
    expected: DevicePushTokenAssignment,
): Promise<void> => {
    await getDevicePushTokenAssignmentRef(encodedDeviceId).transaction((current: unknown) =>
        devicePushTokenAssignmentMatches(current, expected) ? null : current,
    );
};

export const removeUserPushDeviceIndexIfMatches = async (
    userId: string,
    encodedDeviceId: string,
    encodedPushToken: string,
): Promise<void> => {
    await getUserPushDeviceRef(userId, encodedDeviceId).transaction((current: unknown) =>
        current === encodedPushToken ? null : current,
    );
};

export const isCurrentAssignment = async (
    userId: string,
    encodedDeviceId: string,
    encodedPushToken: string,
): Promise<boolean> => {
    const deviceId = decodeRtdbKeySegment(encodedDeviceId);
    if (!deviceId) {
        return false;
    }

    const [pushTokenAssignment, deviceAssignment] = await Promise.all([
        getPushTokenAssignment(encodedPushToken),
        getDevicePushTokenAssignment(encodedDeviceId),
    ]);

    return (
        pushTokenAssignment?.userId === userId &&
        pushTokenAssignment.deviceId === deviceId &&
        deviceAssignment?.userId === userId &&
        deviceAssignment.pushToken === encodedPushToken
    );
};

export const removeStaleUserPushDeviceIndex = async (
    userId: string,
    encodedDeviceId: string,
    encodedPushToken: string,
): Promise<void> => {
    await removeUserPushDeviceIndexIfMatches(userId, encodedDeviceId, encodedPushToken);
};

export const cleanupPreviousDeviceAssignment = async (
    encodedDeviceId: string,
    previousDeviceAssignment: DevicePushTokenAssignment | null,
    nextUserId: string,
    nextEncodedPushToken: string,
): Promise<void> => {
    if (!previousDeviceAssignment) {
        return;
    }

    if (previousDeviceAssignment.pushToken !== nextEncodedPushToken) {
        const previousDeviceId = decodeRtdbKeySegment(encodedDeviceId);
        if (previousDeviceId && decodeRtdbKeySegment(previousDeviceAssignment.pushToken)) {
            await removePushTokenAssignmentIfMatches(previousDeviceAssignment.pushToken, {
                userId: previousDeviceAssignment.userId,
                deviceId: previousDeviceId,
            });
        }
    }

    if (previousDeviceAssignment.userId !== nextUserId) {
        await removeUserPushDeviceIndexIfMatches(
            previousDeviceAssignment.userId,
            encodedDeviceId,
            previousDeviceAssignment.pushToken,
        );
    }
};

export const cleanupPreviousTokenAssignment = async (
    encodedPushToken: string,
    previousTokenAssignment: PushTokenAssignment | null,
    nextUserId: string,
    nextDeviceId: string,
): Promise<void> => {
    if (!previousTokenAssignment) {
        return;
    }

    if (
        previousTokenAssignment.userId === nextUserId &&
        previousTokenAssignment.deviceId === nextDeviceId
    ) {
        return;
    }

    const previousEncodedDeviceId = encodeRtdbKeySegment(previousTokenAssignment.deviceId);
    await Promise.all([
        removeDevicePushTokenAssignmentIfMatches(previousEncodedDeviceId, {
            userId: previousTokenAssignment.userId,
            pushToken: encodedPushToken,
        }),
        removeUserPushDeviceIndexIfMatches(
            previousTokenAssignment.userId,
            previousEncodedDeviceId,
            encodedPushToken,
        ),
    ]);
};

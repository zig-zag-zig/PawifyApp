import { randomUUID } from 'crypto';
import { notificationConfig } from '../../config/runtimeConfig.js';
import { releaseDaprLock, tryAcquireDaprLock } from '../../infrastructure/dapr/daprLockStore.js';

const NOTIFY_NEW_RELEASES_LOCK_ID = 'notifyNewReleases';

type NotificationRunLock = {
    ownerId: string;
    expiresAt: number;
};

export const acquireNotifyNewReleasesLock = async (): Promise<NotificationRunLock | null> => {
    const ownerId = randomUUID();
    const now = Date.now();
    const ttlMs = notificationConfig.notifyNewReleasesLockTtlMs;
    const acquired = await tryAcquireDaprLock(
        NOTIFY_NEW_RELEASES_LOCK_ID,
        ownerId,
        Math.ceil(ttlMs / 1000),
    );

    return acquired ? { ownerId, expiresAt: now + ttlMs } : null;
};

export const releaseNotifyNewReleasesLock = async (lock: NotificationRunLock): Promise<void> => {
    await releaseDaprLock(NOTIFY_NEW_RELEASES_LOCK_ID, lock.ownerId);
};

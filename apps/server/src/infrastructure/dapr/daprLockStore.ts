import { assertOk, daprFetch } from './daprClient.js';

const DEFAULT_LOCK_STORE_NAME = 'pawify-lock';

type LockResponse = {
    success?: boolean;
};

export const tryAcquireDaprLock = async (
    resourceId: string,
    lockOwner: string,
    expiryInSeconds: number,
    storeName = DEFAULT_LOCK_STORE_NAME,
): Promise<boolean> => {
    const response = await daprFetch(`/v1.0-alpha1/lock/${storeName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            resourceId,
            lockOwner,
            expiryInSeconds,
        }),
    });

    if (response.status === 409) {
        await response.body?.cancel();
        return false;
    }

    await assertOk(response, `acquire Dapr lock ${resourceId}`);

    const body = (await response.json().catch(() => ({}))) as LockResponse;
    return body.success !== false;
};

export const releaseDaprLock = async (
    resourceId: string,
    lockOwner: string,
    storeName = DEFAULT_LOCK_STORE_NAME,
): Promise<void> => {
    const response = await daprFetch(`/v1.0-alpha1/unlock/${storeName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            resourceId,
            lockOwner,
        }),
    });

    if (response.status === 404 || response.status === 409) {
        await response.body?.cancel();
        return;
    }

    await assertOk(response, `release Dapr lock ${resourceId}`);
};

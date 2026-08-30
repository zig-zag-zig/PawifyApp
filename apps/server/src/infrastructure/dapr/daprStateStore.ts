import { assertOk, daprFetch } from './daprClient.js';

export type DaprStateSaveItem = {
    key: string;
    value: string;
    metadata?: Record<string, string>;
};

const DEFAULT_STATE_STORE_NAME = 'pawify-state';

const readStateResponseAsString = async (response: Response): Promise<string | null> => {
    const text = await response.text();
    if (!text) {
        return null;
    }

    try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed === null || parsed === undefined) {
            return null;
        }
        return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } catch {
        return text;
    }
};

export const getStateValue = async (
    key: string,
    storeName = DEFAULT_STATE_STORE_NAME,
): Promise<string | null> => {
    const response = await daprFetch(`/v1.0/state/${storeName}/${encodeURIComponent(key)}`);

    if (response.status === 204 || response.status === 404) {
        await response.body?.cancel();
        return null;
    }

    await assertOk(response, `read Dapr state ${key}`);
    return await readStateResponseAsString(response);
};

export const saveStateValues = async (
    items: DaprStateSaveItem[],
    storeName = DEFAULT_STATE_STORE_NAME,
): Promise<void> => {
    if (items.length === 0) {
        return;
    }

    const response = await daprFetch(`/v1.0/state/${storeName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(items),
    });

    await assertOk(response, `save Dapr state batch`);
};

const deleteStateValue = async (
    key: string,
    storeName = DEFAULT_STATE_STORE_NAME,
): Promise<void> => {
    const response = await daprFetch(`/v1.0/state/${storeName}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
    });

    if (response.status === 404) {
        await response.body?.cancel();
        return;
    }

    await assertOk(response, `delete Dapr state ${key}`);
};

export const deleteStateValues = async (
    keys: string[],
    storeName = DEFAULT_STATE_STORE_NAME,
): Promise<void> => {
    await Promise.all(keys.map((key) => deleteStateValue(key, storeName)));
};

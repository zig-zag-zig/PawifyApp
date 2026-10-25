import { assertOk, DaprHttpError, daprFetch } from './daprClient.js';

export type DaprStateSaveItem = {
    key: string;
    value: string;
    metadata?: Record<string, string>;
};

export type DaprStateEntry = {
    value: string | null;
    /**
     * Opaque version token for optimistic concurrency. Absent when the key does
     * not exist yet.
     */
    etag: string | undefined;
};

// Dapr quotes ETags in the response header; the save API expects them bare.
const normalizeEtag = (raw: string | null): string | undefined => {
    if (!raw) {
        return undefined;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        return undefined;
    }

    return trimmed.replace(/^"|"$/g, '');
};

/**
 * Reads a state value together with its ETag, for compare-and-set writes.
 */
export const getStateEntry = async (
    key: string,
    storeName = DEFAULT_STATE_STORE_NAME,
): Promise<DaprStateEntry> => {
    const response = await daprFetch(`/v1.0/state/${storeName}/${encodeURIComponent(key)}`);

    if (response.status === 204 || response.status === 404) {
        await response.body?.cancel();
        return { value: null, etag: undefined };
    }

    try {
        await assertOk(response, `read Dapr state ${key}`);
        const etag = normalizeEtag(response.headers.get('etag'));
        return { value: await readStateResponseAsString(response), etag };
    } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        throw error;
    }
};

/**
 * Writes a value only if it still carries the given ETag.
 *
 * Returns false when another writer got there first, so the caller can re-read
 * and retry. Pass `etag: undefined` for an unconditional first write.
 */
export const saveStateValueIfMatch = async (
    key: string,
    value: string,
    etag: string | undefined,
    storeName = DEFAULT_STATE_STORE_NAME,
): Promise<boolean> => {
    const item: DaprStateSaveItem & { etag?: string } = { key, value };
    if (etag !== undefined) {
        item.etag = etag;
    }

    const response = await daprFetch(`/v1.0/state/${storeName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify([item]),
    });

    if (response.status === 409 || response.status === 412) {
        await response.body?.cancel().catch(() => undefined);
        return false;
    }

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new DaprHttpError(response.status, bodyText, `save Dapr state ${key}`);
    }

    await response.body?.cancel().catch(() => undefined);
    return true;
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

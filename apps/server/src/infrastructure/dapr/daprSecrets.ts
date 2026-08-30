import { assertOk, daprFetch } from './daprClient.js';

const secretCache = new Map<string, string | undefined>();

const getCacheKey = (storeName: string, key: string): string => `${storeName}:${key}`;

export const getDaprSecret = async (
    key: string,
    storeName = process.env.DAPR_SECRET_STORE_NAME?.trim() || 'pawify-secrets',
): Promise<string | undefined> => {
    const cacheKey = getCacheKey(storeName, key);
    if (secretCache.has(cacheKey)) {
        return secretCache.get(cacheKey);
    }

    const response = await daprFetch(`/v1.0/secrets/${storeName}/${encodeURIComponent(key)}`);

    if (response.status === 404) {
        await response.body?.cancel();
        secretCache.set(cacheKey, undefined);
        return undefined;
    }

    await assertOk(response, `read Dapr secret ${key}`);

    const body = (await response.json()) as Record<string, unknown>;
    const value = typeof body[key] === 'string' && body[key].trim() ? body[key] : undefined;

    secretCache.set(cacheKey, value);
    return value;
};

export const clearDaprSecretCache = (): void => {
    secretCache.clear();
};

import { DaprHttpError, daprFetch } from './daprClient.js';

const secretCache = new Map<string, string | undefined>();

const getCacheKey = (storeName: string, key: string): string => `${storeName}:${key}`;

/**
 * Recognises "this key does not exist" in a Dapr error body.
 *
 * The API contract says a missing secret is a 404, but the local file secret
 * store answers it with HTTP 500 and an `ERR_SECRET_GET` body instead:
 *
 *   {"errorCode":"ERR_SECRET_GET","message":"failed getting secret with key
 *    tidal-token from secret store pawify-secrets: secret tidal-token not found"}
 *
 * Only the "not found" wording identifies an absent key. Every other
 * ERR_SECRET_GET (unreadable file, malformed JSON, unregistered store) is a real
 * failure and must still surface, otherwise a broken deployment would silently
 * serve fallbacks forever.
 */
const isMissingSecretBody = (bodyText: string, key: string): boolean =>
    bodyText.includes('ERR_SECRET_GET') &&
    bodyText.includes(key) &&
    /not found/i.test(bodyText);

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

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');

        if (response.status === 500 && isMissingSecretBody(bodyText, key)) {
            secretCache.set(cacheKey, undefined);
            return undefined;
        }

        throw new DaprHttpError(
            response.status,
            bodyText,
            `read Dapr secret ${key}: HTTP ${response.status}`,
        );
    }

    const body = (await response.json()) as Record<string, unknown>;
    const value = typeof body[key] === 'string' && body[key].trim() ? body[key] : undefined;

    secretCache.set(cacheKey, value);
    return value;
};

export const clearDaprSecretCache = (): void => {
    secretCache.clear();
};

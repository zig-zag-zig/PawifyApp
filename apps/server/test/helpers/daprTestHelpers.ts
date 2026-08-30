import { afterEach } from 'node:test';

process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test';
process.env.MUSICBRAINZ_DELAY_MS = '1';
process.env.MUSICBRAINZ_BACKGROUND_DELAY_MS = '1';
process.env.NOTIFY_NEW_RELEASES_LOCK_TTL_MS = '3600001';

const originalFetch = globalThis.fetch;

export const installFetch = (
    handler: (url: string, init: RequestInit) => Promise<Response> | Response,
): void => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) =>
        await handler(String(input), init ?? {})) as typeof fetch;
};

afterEach(() => {
    globalThis.fetch = originalFetch;
});

export class DaprHttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly bodyText: string,
        message = `Dapr HTTP error ${status}`,
    ) {
        super(message);
    }
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const getDaprBaseUrl = (): string => {
    const endpoint = process.env.DAPR_HTTP_ENDPOINT?.trim();
    if (endpoint) {
        return trimTrailingSlash(endpoint);
    }

    return `http://127.0.0.1:${process.env.DAPR_HTTP_PORT ?? '3500'}`;
};

export const getDaprApiToken = (): string | undefined => {
    const token = process.env.DAPR_API_TOKEN?.trim();
    return token ? token : undefined;
};

export const daprFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    const token = getDaprApiToken();

    if (token) {
        headers.set('dapr-api-token', token);
    }

    return await fetch(`${getDaprBaseUrl()}${path}`, {
        ...init,
        headers,
    });
};

export const assertOk = async (response: Response, context: string): Promise<void> => {
    if (response.ok) {
        return;
    }

    const bodyText = await response.text().catch(() => '');
    throw new DaprHttpError(response.status, bodyText, `${context}: HTTP ${response.status}`);
};

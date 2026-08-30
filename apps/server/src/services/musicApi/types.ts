export type MusicBrainzPriority = 'foreground' | 'background';

export type HttpOptions = {
    method: 'HEAD' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers: {
        'User-Agent'?: string;
        Authorization?: string;
    };
};

export type FetchFailureResult = {
    __fetchFailure: true;
    status: number | null;
};

export const isFetchFailureResult = (value: unknown): value is FetchFailureResult => {
    return (
        value !== null &&
        typeof value === 'object' &&
        (value as FetchFailureResult).__fetchFailure === true &&
        ((value as FetchFailureResult).status === null ||
            typeof (value as FetchFailureResult).status === 'number')
    );
};

export const isConfirmedMissingFetchFailure = (value: unknown): value is FetchFailureResult => {
    return isFetchFailureResult(value) && (value.status === 404 || value.status === 410);
};

export type DiscogsResult = {
    image: string | null | undefined;
};

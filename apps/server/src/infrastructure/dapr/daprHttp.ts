import { daprFetch } from './daprClient.js';

export type DaprEndpointName = 'musicbrainz' | 'coverartarchive' | 'discogs' | 'genius' | 'expo';

export const invokeHttpEndpoint = async (
    endpoint: DaprEndpointName,
    methodPathAndQuery: string,
    init: RequestInit = {},
): Promise<Response> => {
    const path = methodPathAndQuery.startsWith('/') ? methodPathAndQuery : `/${methodPathAndQuery}`;

    return await daprFetch(`/v1.0/invoke/${endpoint}/method${path}`, init);
};

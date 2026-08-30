import { invokeHttpEndpoint, type DaprEndpointName } from '../../infrastructure/dapr/daprHttp.js';
import { getMusicBrainzUserAgent } from './credentials.js';
import { createAbortError, delayWithAbort, isAbortError } from './abortableDelay.js';
import { applyRateLimitHeaders, getRateLimiter, type ExternalService } from './rateLimiter.js';
import type { FetchFailureResult, HttpOptions, MusicBrainzPriority } from './types.js';

export { isAbortError } from './abortableDelay.js';

let pendingForegroundMusicBrainzRequests = 0;
let activeForegroundMusicBrainzRequests = 0;

const nonRetriableStatusCodes = new Set([400, 401, 403, 404, 405, 410, 422]);

const waitForForegroundMusicBrainzDrain = async (signal?: AbortSignal): Promise<void> => {
    while (pendingForegroundMusicBrainzRequests > 0 || activeForegroundMusicBrainzRequests > 0) {
        await delayWithAbort(50, signal);
    }
};

const createFetchFailureResult = (status: number | null): FetchFailureResult => {
    return {
        __fetchFailure: true,
        status,
    };
};

const toExternalService = (endpoint: DaprEndpointName): ExternalService => endpoint;

export const fetchDaprProvider = async (
    endpoint: DaprEndpointName,
    methodPathAndQuery: string,
    options: HttpOptions,
    addUserAgent = true,
    noRetry = false,
    failureMode: 'null' | 'status' = 'null',
    signal?: AbortSignal,
    priority: MusicBrainzPriority = 'foreground',
): Promise<any> => {
    if (signal?.aborted) {
        throw createAbortError();
    }

    const service = toExternalService(endpoint);
    const rateLimiter = getRateLimiter(service, priority);
    const useForegroundTracking = service === 'musicbrainz' && priority === 'foreground';
    const waitForForegroundDrain = service === 'musicbrainz' && priority === 'background';
    const headers = { ...options.headers };

    if (addUserAgent) {
        headers['User-Agent'] = getMusicBrainzUserAgent();
    }

    let release: (() => void) | null = null;
    let isForegroundActive = false;
    let isForegroundPending = false;
    let response: Response | null = null;

    try {
        if (waitForForegroundDrain) {
            await waitForForegroundMusicBrainzDrain(signal);
        }

        if (signal?.aborted) {
            throw createAbortError();
        }

        if (useForegroundTracking) {
            pendingForegroundMusicBrainzRequests += 1;
            isForegroundPending = true;
        }

        release = await rateLimiter.acquire();
        if (useForegroundTracking) {
            if (isForegroundPending) {
                pendingForegroundMusicBrainzRequests = Math.max(
                    0,
                    pendingForegroundMusicBrainzRequests - 1,
                );
                isForegroundPending = false;
            }

            activeForegroundMusicBrainzRequests += 1;
            isForegroundActive = true;
        }

        response = await invokeHttpEndpoint(endpoint, methodPathAndQuery, {
            ...options,
            headers,
            signal,
        });

        applyRateLimitHeaders(response, rateLimiter, service);

        if (!response.ok) {
            // Drop the unconsumed body so the undici socket is released instead of
            // being pinned until GC (connection-pool exhaustion under sustained
            // upstream errors). HEAD responses have no body and skip this branch.
            await response.body?.cancel();
            if (failureMode === 'status') {
                return createFetchFailureResult(
                    nonRetriableStatusCodes.has(response.status) || noRetry
                        ? response.status
                        : null,
                );
            }

            return null;
        }

        if (options.method === 'HEAD') {
            return true;
        }

        return await response.json();
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }

        // The response was obtained but its body was not (fully) consumed — e.g.
        // response.json() failed on a non-JSON body. Cancel the stream best-effort:
        // some implementations already consumed/locked it (undici reads the body
        // before parsing), in which case cancel is a no-op and must not fail.
        if (response?.body) {
            try {
                await response.body.cancel();
            } catch {
                // Nothing left to drain; keep the failure result behavior.
            }
        }

        return failureMode === 'status' ? createFetchFailureResult(null) : null;
    } finally {
        if (isForegroundPending) {
            pendingForegroundMusicBrainzRequests = Math.max(
                0,
                pendingForegroundMusicBrainzRequests - 1,
            );
        }
        if (isForegroundActive) {
            activeForegroundMusicBrainzRequests = Math.max(
                0,
                activeForegroundMusicBrainzRequests - 1,
            );
        }
        if (release) {
            release();
        }
    }
};

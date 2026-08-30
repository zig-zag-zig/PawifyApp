import type { RemoteValueState } from '../../modules/models/models.js';
import { cacheConfig } from '../../config/runtimeConfig.js';
import type { CoverState, LyricsState } from '../types/cacheTypes.js';

export const TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS = cacheConfig.transientRemoteValueRetryWindowMs;

const nextRefetchAt = (retryWindowMs: number): number => Date.now() + retryWindowMs;

export const shouldRefetchRemoteState = (
    state: CoverState | LyricsState | undefined,
    now: number = Date.now(),
): boolean => {
    if (!state) {
        return true;
    }

    if (state.url === undefined && state.nextRefetchAt === undefined) {
        return true;
    }

    if (state.nextRefetchAt === undefined) {
        return false;
    }

    return now >= state.nextRefetchAt;
};

export const mapCoverState = (url: RemoteValueState): CoverState => {
    if (url === undefined) {
        return {
            url,
            nextRefetchAt: nextRefetchAt(TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS),
        };
    }

    if (url) {
        return { url, nextRefetchAt: undefined };
    }

    return { url, confirmedMiss: true };
};

export const mapLyricsState = (url: RemoteValueState): LyricsState => {
    if (url === undefined) {
        return {
            url,
            nextRefetchAt: nextRefetchAt(TRANSIENT_REMOTE_VALUE_RETRY_WINDOW_MS),
        };
    }

    if (typeof url === 'string' && url.trim().length > 0) {
        return { url, nextRefetchAt: undefined };
    }

    return { url, confirmedMiss: true };
};

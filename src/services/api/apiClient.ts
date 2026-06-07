import { ENV } from '../../config/env';
import {
  createApiCallError,
  createNetworkApiCallError,
} from '../apiErrors';
import {
  waitForTaskResultFromSignals,
  type WaitForTaskResultOptions,
} from '../taskResultWaiter';
import type { TaskResultResponse } from '../../types/apiTypes';
import {
  describeError,
  describeIds,
  describeValueShape,
  diagnosticError,
  diagnosticLog,
  diagnosticWarn,
  elapsedSince,
} from '../../utils/diagnostics';

export type ApiRequestMethod = 'GET' | 'POST';

export type ApiRequestOptions = {
  body?: unknown;
  method?: ApiRequestMethod;
  requiresAuth?: boolean;
};

export type ApiClient = {
  request: <T>(endpoint: string, options?: ApiRequestOptions) => Promise<T>;
  withSourcePushToken: <T extends Record<string, unknown>>(body: T) => Promise<T & { sourcePushToken?: string }>;
  waitForTaskResult: <T>(
    taskId: string,
    getTaskResult: <TResult>(taskId: string) => Promise<TaskResultResponse<TResult>>,
    options?: WaitForTaskResultOptions,
  ) => Promise<TaskResultResponse<T>>;
  getDeviceId: () => Promise<string>;
};

export type ApiClientConfig = {
  apiBaseUrl?: string;
  apiVersion?: string;
  fetchFn?: typeof fetch;
  getAccessToken: () => Promise<string>;
  getDeviceId?: () => Promise<string>;
  getSourcePushToken?: () => Promise<string | null>;
};

const diagnosticApiEndpoints = new Set([
  'getArtistDetails',
  'getArtistReleases',
  'getReleaseGroupReleases',
  'getTaskResult',
]);

function shouldLogApiDiagnostics(endpoint: string) {
  return diagnosticApiEndpoints.has(endpoint);
}

export function buildApiUrl(baseUrl: string, apiVersion: string, endpoint: string) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedApiVersion = apiVersion.replace(/^\/+|\/+$/g, '');
  return `${normalizedBaseUrl}${normalizedApiVersion}/${endpoint.replace(/^\/+/, '')}`;
}

function describeApiBody(body: unknown) {
  if (!body) {
    return null;
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    return describeValueShape(body);
  }

  const record = body as Record<string, unknown>;
  return {
    artistId: typeof record.artistId === 'string' ? record.artistId : undefined,
    releaseGroupId: typeof record.releaseGroupId === 'string' ? record.releaseGroupId : undefined,
    releaseId: typeof record.releaseId === 'string' ? record.releaseId : undefined,
    taskId: typeof record.taskId === 'string' ? record.taskId : undefined,
    artistIds: Array.isArray(record.artistIds)
      ? describeIds(record.artistIds.filter((id): id is string => typeof id === 'string'))
      : undefined,
    releaseGroupIds: Array.isArray(record.releaseGroupIds)
      ? describeIds(record.releaseGroupIds.filter((id): id is string => typeof id === 'string'))
      : undefined,
    hasSourcePushToken: typeof record.sourcePushToken === 'string' && record.sourcePushToken.length > 0,
    shape: describeValueShape(body),
  };
}

function describeApiResponse(endpoint: string, responseBody: unknown) {
  const shape = describeValueShape(responseBody);

  if (endpoint !== 'getTaskResult' || !responseBody || typeof responseBody !== 'object') {
    return shape;
  }

  const taskResult = responseBody as TaskResultResponse<unknown>;
  return {
    ...shape,
    taskStatus: taskResult.status,
    taskType: taskResult.type,
    taskId: taskResult.taskId,
    subtaskIds: Array.isArray(taskResult.subtaskIds)
      ? describeIds(taskResult.subtaskIds.filter((id): id is string => typeof id === 'string'))
      : undefined,
    completedSubtaskIds: Array.isArray(taskResult.completedSubtaskIds)
      ? describeIds(taskResult.completedSubtaskIds.filter((id): id is string => typeof id === 'string'))
      : undefined,
    subtaskCount: taskResult.subtaskCount,
    completedSubtaskCount: taskResult.completedSubtaskCount,
    hasResult: taskResult.result !== undefined,
    hasError: taskResult.error !== undefined,
    resultShape: describeValueShape(taskResult.result),
    errorShape: taskResult.error !== undefined ? describeValueShape(taskResult.error) : undefined,
  };
}

async function defaultGetDeviceId(): Promise<string> {
  return '';
}

async function defaultGetSourcePushToken(): Promise<string | null> {
  return null;
}

export function createApiClient({
  apiBaseUrl = ENV.apiBaseUrl,
  apiVersion = ENV.apiVersion,
  fetchFn = fetch,
  getAccessToken,
  getDeviceId = defaultGetDeviceId,
  getSourcePushToken = defaultGetSourcePushToken,
}: ApiClientConfig): ApiClient {
  const request = async <T,>(
    endpoint: string,
    {
      body = null,
      method = 'POST',
      requiresAuth = true,
    }: ApiRequestOptions = {},
  ): Promise<T> => {
    const shouldLogDiagnostics = shouldLogApiDiagnostics(endpoint);
    const requestStartedAt = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth) {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }
      headers.Authorization = `Bearer ${accessToken}`;
    }

    if (shouldLogDiagnostics) {
      diagnosticLog('api', 'request-start', {
        url: endpoint,
        method,
        body: describeApiBody(body),
      });
    }

    let response: Response;
    try {
      response = await fetchFn(buildApiUrl(apiBaseUrl, apiVersion, endpoint), {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });
    } catch (error) {
      const apiError = createNetworkApiCallError(error);
      if (shouldLogDiagnostics) {
        diagnosticError('api', 'network-error', {
          url: endpoint,
          method,
          elapsedMs: elapsedSince(requestStartedAt),
          body: describeApiBody(body),
          error: describeError(apiError),
        });
      }
      throw apiError;
    }

    if (!response.ok) {
      const responseBody = await response.text();
      const error = createApiCallError(response.status, responseBody);
      if (shouldLogDiagnostics) {
        diagnosticWarn('api', 'request-failed', {
          url: endpoint,
          method,
          status: response.status,
          elapsedMs: elapsedSince(requestStartedAt),
          body: describeApiBody(body),
          error: describeError(error),
        });
      }
      throw error;
    }

    const responseTextFallback = response.clone();
    let parsedResponse: T;
    try {
      parsedResponse = (await response.json()) as T;
    } catch {
      parsedResponse = (await responseTextFallback.text()) as T;
    }

    if (shouldLogDiagnostics) {
      diagnosticLog('api', 'request-done', {
        url: endpoint,
        method,
        status: response.status,
        elapsedMs: elapsedSince(requestStartedAt),
        body: describeApiBody(body),
        response: describeApiResponse(endpoint, parsedResponse),
      });
    }

    return parsedResponse;
  };

  const withSourcePushToken = async <T extends Record<string, unknown>>(body: T): Promise<T & { sourcePushToken?: string }> => {
    try {
      const sourcePushToken = await getSourcePushToken();
      return sourcePushToken ? { ...body, sourcePushToken } : body;
    } catch (error) {
      console.warn('api: read source push token failed', error);
      return body;
    }
  };

  const waitForTaskResult = async <T,>(
    taskId: string,
    getTaskResult: <TResult>(taskId: string) => Promise<TaskResultResponse<TResult>>,
    options?: WaitForTaskResultOptions,
  ): Promise<TaskResultResponse<T>> => {
    return waitForTaskResultFromSignals<T>(taskId, getTaskResult, options);
  };

  return {
    request,
    withSourcePushToken,
    waitForTaskResult,
    getDeviceId,
  };
}

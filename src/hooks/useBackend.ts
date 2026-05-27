import { useCallback, useMemo } from 'react';
import { getStoredPushToken } from '../services/pushTokenStorage';
import type {
  ArtistDetailsResponse,
  ArtistReleasesResponse,
  FollowingResponse,
  NewReleasesResponse,
  ReleaseGroupReleasesResponse,
  ReleaseNotificationSettingsResponse,
  ReleaseResponse,
  SearchArtistsResponse,
  TaskResultResponse
} from '../types/apiTypes';
import {
  createApiCallError,
  createNetworkApiCallError,
} from '../services/apiErrors';
import {
  waitForTaskResultFromSignals,
  type WaitForTaskResultOptions,
} from '../services/taskResultWaiter';
import {
  describeError,
  describeIds,
  describeValueShape,
  diagnosticError,
  diagnosticLog,
  diagnosticWarn,
  elapsedSince,
} from '../utils/diagnostics';
import { ENV } from '../config/env';
import { getUniqueId } from 'react-native-device-info';
import { ReleaseNotificationSettings } from '../modules/models/models';

const BASE_URL = ENV.apiBaseUrl;
const API_VERSION_PATH = `${ENV.apiVersion}/`;

const diagnosticApiUrls = new Set([
  'getArtistDetails',
  'getArtistReleases',
  'getReleaseGroupReleases',
  'getTaskResult',
]);

function shouldLogApiDiagnostics(url: string) {
  return diagnosticApiUrls.has(url);
}

function buildApiUrl(endpoint: string) {
  return `${BASE_URL}${API_VERSION_PATH}${endpoint.replace(/^\/+/, '')}`;
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

function describeApiResponse(url: string, responseBody: unknown) {
  const shape = describeValueShape(responseBody);

  if (url !== 'getTaskResult' || !responseBody || typeof responseBody !== 'object') {
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

export const useBackend = (getAccessToken: () => Promise<string>) => {
  const withSourcePushToken = useCallback(async <T extends Record<string, unknown>>(body: T): Promise<T & { sourcePushToken?: string }> => {
    try {
      const sourcePushToken = await getStoredPushToken();
      return sourcePushToken ? { ...body, sourcePushToken } : body;
    } catch (error) {
      console.warn('api: read source push token failed', error);
      return body;
    }
  }, []);

  const apiCall = useCallback(async <T,>(
    url: string,
    body: any = null,
    method: 'POST' | 'GET' = 'POST',
    requiresAuth = true,
  ): Promise<T> => {
    const shouldLogDiagnostics = shouldLogApiDiagnostics(url);
    const requestStartedAt = Date.now();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (requiresAuth) {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('User not authenticated');
      }
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    if (shouldLogDiagnostics) {
      diagnosticLog('api', 'request-start', {
        url,
        method,
        body: describeApiBody(body),
      });
    }

    let response: Response;
    try {
      response = await fetch(buildApiUrl(url), {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
    } catch (error) {
      const apiError = createNetworkApiCallError(error);
      if (shouldLogDiagnostics) {
        diagnosticError('api', 'network-error', {
          url,
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
          url,
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
    } catch (error) {
      parsedResponse = (await responseTextFallback.text()) as T;
    }

    if (shouldLogDiagnostics) {
      diagnosticLog('api', 'request-done', {
        url,
        method,
        status: response.status,
        elapsedMs: elapsedSince(requestStartedAt),
        body: describeApiBody(body),
        response: describeApiResponse(url, parsedResponse),
      });
    }

    return parsedResponse;
  }, [getAccessToken]);

  const followArtist = useCallback(async (artistId: string) =>
    await apiCall<string>('followArtist', await withSourcePushToken({ artistId })), [apiCall, withSourcePushToken]);

  const unfollowArtist = useCallback(async (artistId: string) =>
    await apiCall<string>('unfollowArtist', await withSourcePushToken({ artistId })), [apiCall, withSourcePushToken]);

  const unfollowArtists = useCallback(async (artistIds: string[]) =>
    await apiCall<string>('unfollowArtists', await withSourcePushToken({ artistIds })), [apiCall, withSourcePushToken]);

  const getFollowing = useCallback(async () =>
    await apiCall<FollowingResponse>('getFollowing', null, 'GET'), [apiCall]);

  const getNewReleases = useCallback(async () =>
    await apiCall<NewReleasesResponse>('getNewReleases', null, 'GET'), [apiCall]);

  const removeNewReleases = useCallback(async (releaseIds: string[]) =>
    await apiCall<string>('removeNewReleases', await withSourcePushToken({ releaseIds })), [apiCall, withSourcePushToken]);

  const getReleaseNotificationSettings = useCallback(async () =>
    await apiCall<ReleaseNotificationSettingsResponse>('getReleaseNotificationSettings', null, 'GET'), [apiCall]);

  const updateReleaseNotificationSettings = useCallback(async (settings: ReleaseNotificationSettings) =>
    await apiCall<ReleaseNotificationSettingsResponse>(
      'updateReleaseNotificationSettings',
      await withSourcePushToken({ ...settings }),
    ), [apiCall, withSourcePushToken]);

  const deleteUserAccount = useCallback(async () =>
    await apiCall<string>('deleteUserAccount'), [apiCall]);

  const getArtistDetails = useCallback(async (artistId: string) =>
    await apiCall<ArtistDetailsResponse>('getArtistDetails', { artistId }), [apiCall]);

  const getArtistReleases = useCallback(async (artistId: string) =>
    await apiCall<ArtistReleasesResponse>('getArtistReleases', { artistId }), [apiCall]);

  const getReleaseGroupReleases = useCallback(async (releaseGroupId: string) =>
    await apiCall<ReleaseGroupReleasesResponse>('getReleaseGroupReleases', { releaseGroupId }), [apiCall]);

  const savePushToken = useCallback(async (pushToken: string) => {
    return await apiCall<string>('savePushToken', { pushToken, deviceId: await getUniqueId() }).then(() => pushToken)
  }, [apiCall]);

  const deletePushToken = useCallback(async () =>
    await apiCall<string>('deletePushToken', { deviceId: await getUniqueId() }), [apiCall]);

  const searchArtists = useCallback(async (query: string, limit: number, offset: number = 0) =>
    await apiCall<SearchArtistsResponse>('searchArtists', { query, offset, limit }), [apiCall]);

  const getRelease = useCallback(async (releaseId: string) =>
    await apiCall<ReleaseResponse>('getRelease', { releaseId }), [apiCall]);

  const getTaskResult = useCallback(async <T,>(taskId: string) =>
    await apiCall<TaskResultResponse<T>>('getTaskResult', { taskId }), [apiCall]);

  const waitForTaskResult = useCallback(async <T,>(
    taskId: string,
    options?: WaitForTaskResultOptions
  ): Promise<TaskResultResponse<T>> => {
    return await waitForTaskResultFromSignals<T>(taskId, getTaskResult, options);
  }, [getTaskResult]);

  const sendOtp = useCallback(async (email: string) =>
    await apiCall<string>('sendOtp', { email }, 'POST', false), [apiCall]);

  const verifyOtp = useCallback(async (email: string, otp: string) =>
    await apiCall<string>('verifyOtp', { email, otp }, 'POST', false), [apiCall]);

  const revokeToken = useCallback(async () =>
    await apiCall<string>('revokeToken', null, 'GET'), [apiCall]);

  const changeEmail = useCallback(async (email: string) =>
    await apiCall<string>('changeEmail', { email }), [apiCall]);

  return useMemo(() => ({
    followArtist,
    unfollowArtist,
    unfollowArtists,
    getFollowing,
    getNewReleases,
    getReleaseNotificationSettings,
    removeNewReleases,
    updateReleaseNotificationSettings,
    deleteUserAccount,
    getArtistDetails,
    getArtistReleases,
    getReleaseGroupReleases,
    savePushToken,
    deletePushToken,
    searchArtists,
    getRelease,
    getTaskResult,
    waitForTaskResult,
    sendOtp,
    verifyOtp,
    revokeToken,
    changeEmail,
  }), [
    changeEmail,
    deletePushToken,
    deleteUserAccount,
    followArtist,
    getArtistDetails,
    getArtistReleases,
    getFollowing,
    getNewReleases,
    getReleaseNotificationSettings,
    getRelease,
    getReleaseGroupReleases,
    getTaskResult,
    removeNewReleases,
    revokeToken,
    savePushToken,
    searchArtists,
    sendOtp,
    unfollowArtist,
    unfollowArtists,
    updateReleaseNotificationSettings,
    verifyOtp,
    waitForTaskResult,
  ]);
};

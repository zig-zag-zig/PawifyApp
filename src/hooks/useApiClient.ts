import { useMemo } from 'react';
import { getUniqueId } from 'react-native-device-info';
import { getStoredPushToken } from '../services/pushTokenStorage';
import { createApiClient } from '../services/api/apiClient';

export function useApiClient(
  getAccessToken: () => Promise<string>,
  onAuthFailure?: () => void,
) {
  return useMemo(() => createApiClient({
    getAccessToken,
    getDeviceId: getUniqueId,
    getSourcePushToken: getStoredPushToken,
    onAuthFailure,
  }), [getAccessToken, onAuthFailure]);
}

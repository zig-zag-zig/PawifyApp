import type { ApiClient } from '../../../services/api/apiClient';

/**
 * Remote push-token registration/cleanup calls. Text endpoints: the server
 * acknowledges with a plain-text body.
 */
export function createPushTokenApi(apiClient: ApiClient) {
  return {
    savePushToken: async (pushToken: string) => {
      await apiClient.requestText('savePushToken', {
        body: { pushToken, deviceId: await apiClient.getDeviceId() },
      });
      return pushToken;
    },
    deletePushToken: async () => {
      await apiClient.requestText('deletePushToken', {
        body: { deviceId: await apiClient.getDeviceId() },
      });
    },
  };
}

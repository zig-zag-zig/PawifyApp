import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback } from 'react';
import { EventService } from '../services/eventService';
import { setStoredPushToken } from '../services/pushTokenStorage';

type SavePushToken = (pushToken: string) => Promise<string>;

export const useRegisterForPushNotifications = () => {
    const registerForPushNotificationsAsync = useCallback(async (
        savePushToken: SavePushToken,
    ) => {
        if (!Device.isDevice) {
            console.warn('push-registration: skipped (requires physical device)');
            return;
        }

        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.warn('push-registration: notification permission denied');
            return;
        }

        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        if (!projectId) throw new Error('Project ID not found');

        try {
            const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            await savePushToken(token);
            await setStoredPushToken(token);
            EventService.setClientPushToken(token);
        } catch (error) {
            console.error('push-registration: register push token failed', error);
        }
    }, []);

    return {
        registerForPushNotificationsAsync,
    };
}

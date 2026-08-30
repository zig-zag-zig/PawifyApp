// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('react-native', () => ({
    AppState: { currentState: 'active', addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

vi.mock('expo-constants', () => ({
    default: {
        expoConfig: {
            extra: { eas: { projectId: 'test-project-id' } },
        },
    },
}));

vi.mock('expo-device', () => ({
    isDevice: true,
}));

vi.mock('expo-notifications', () => ({
    getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
    requestPermissionsAsync: vi.fn(),
    getExpoPushTokenAsync: vi.fn(async () => ({ data: 'expo-push-token-123' })),
}));

vi.mock('../services/eventService', () => ({
    EventService: {
        setClientPushToken: vi.fn(),
        getClientPushToken: vi.fn(),
    },
}));

vi.mock('../services/pushTokenStorage', () => ({
    getStoredPushToken: vi.fn(async () => null),
    setStoredPushToken: vi.fn(async () => { }),
    removeStoredPushToken: vi.fn(async () => { }),
}));

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { EventService } from '../services/eventService';
import { setStoredPushToken } from '../services/pushTokenStorage';
import { useRegisterForPushNotifications } from './useRegisterForPushNotifications';

const mockDevice = Device as { isDevice: boolean };

describe('useRegisterForPushNotifications', () => {
    beforeEach(() => {
        mockDevice.isDevice = true;
    });

    it('registers push notifications and saves token', async () => {
        const savePushToken = vi.fn(async (token: string) => token);
        const { result } = renderHook(() => useRegisterForPushNotifications());

        await act(async () => {
            await result.current.registerForPushNotificationsAsync(savePushToken);
        });

        expect(vi.mocked(Notifications.getExpoPushTokenAsync)).toHaveBeenCalled();
        expect(savePushToken).toHaveBeenCalledWith('expo-push-token-123');
        expect(setStoredPushToken).toHaveBeenCalledWith('expo-push-token-123');
        expect(EventService.setClientPushToken).toHaveBeenCalledWith('expo-push-token-123');
    });

    it('skips registration when not a physical device', async () => {
        mockDevice.isDevice = false;

        const savePushToken = vi.fn();
        const { result } = renderHook(() => useRegisterForPushNotifications());

        await act(async () => {
            await result.current.registerForPushNotificationsAsync(savePushToken);
        });

        expect(savePushToken).not.toHaveBeenCalled();
    });

    it('requests permission when not already granted', async () => {
        mockDevice.isDevice = true;
        vi.mocked(Notifications.getPermissionsAsync).mockResolvedValueOnce({ status: 'undetermined' } as any);
        vi.mocked(Notifications.requestPermissionsAsync).mockResolvedValueOnce({ status: 'granted' } as any);

        const savePushToken = vi.fn(async (t: string) => t);
        const { result } = renderHook(() => useRegisterForPushNotifications());

        await act(async () => {
            await result.current.registerForPushNotificationsAsync(savePushToken);
        });

        expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
        expect(savePushToken).toHaveBeenCalled();
    });
});

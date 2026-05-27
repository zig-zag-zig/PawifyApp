import AsyncStorage from '@react-native-async-storage/async-storage';

const pushTokenStorageKey = 'expoPushToken';

export async function getStoredPushToken(): Promise<string | null> {
    return await AsyncStorage.getItem(pushTokenStorageKey);
}

export async function setStoredPushToken(pushToken: string): Promise<void> {
    await AsyncStorage.setItem(pushTokenStorageKey, pushToken);
}

export async function removeStoredPushToken(): Promise<void> {
    await AsyncStorage.removeItem(pushTokenStorageKey);
}

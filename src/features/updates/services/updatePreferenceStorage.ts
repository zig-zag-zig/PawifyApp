import AsyncStorage from '@react-native-async-storage/async-storage';

const keyPrefix = 'pawify:update';

export async function getUpdatePreference(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${keyPrefix}:${key}`);
  } catch {
    return null;
  }
}

export async function setUpdatePreference(key: string, value: string): Promise<void> {
  await AsyncStorage.setItem(`${keyPrefix}:${key}`, value);
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExternalLinkService } from '@pawify/shared';
import { STREAMING_SERVICES } from '../components/externalLinks/externalLinkConstants';

const STORAGE_KEY = 'pawify.preferredStreamingService.v1';

export const loadPreferredStreamingService = async (): Promise<ExternalLinkService | null> => {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        return raw && STREAMING_SERVICES.has(raw as ExternalLinkService)
            ? (raw as ExternalLinkService)
            : null;
    } catch (error) {
        console.warn('preferred-streaming-service: failed to load', error);
        return null;
    }
};

export const savePreferredStreamingService = async (
    service: ExternalLinkService | null,
): Promise<void> => {
    try {
        if (service === null) {
            await AsyncStorage.removeItem(STORAGE_KEY);
            return;
        }

        await AsyncStorage.setItem(STORAGE_KEY, service);
    } catch (error) {
        console.warn('preferred-streaming-service: failed to save', error);
    }
};

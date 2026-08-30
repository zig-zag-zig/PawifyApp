import type { PushTokenUseCaseDependencies } from '../ports.js';

export const createSavePushTokenUseCase =
    ({ pushTokenGateway }: PushTokenUseCaseDependencies) =>
    async (userId: string, deviceId: string, pushToken: string): Promise<void> => {
        await pushTokenGateway.savePushToken(userId, deviceId, pushToken);
    };

export const createDeletePushTokenUseCase =
    ({ pushTokenGateway }: PushTokenUseCaseDependencies) =>
    async (userId: string, deviceId: string): Promise<void> => {
        await pushTokenGateway.deletePushToken(userId, deviceId);
    };

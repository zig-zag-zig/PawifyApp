interface PushTokenGateway {
    savePushToken(userId: string, deviceId: string, pushToken: string): Promise<void>;
    deletePushToken(userId: string, deviceId: string): Promise<void>;
}

export type PushTokenUseCaseDependencies = {
    pushTokenGateway: PushTokenGateway;
};

export const getPushTokensFromStore = async (userId: string): Promise<string[]> => {
    const { getPushTokensFromDb } = await import('../firebase/pushTokenStore.js');
    return await getPushTokensFromDb(userId);
};

export const deletePushTokensFromStore = async (
    userId: string,
    pushTokens: string[],
): Promise<void> => {
    const { deletePushTokensFromDb } = await import('../firebase/pushTokenStore.js');
    await deletePushTokensFromDb(userId, pushTokens);
};

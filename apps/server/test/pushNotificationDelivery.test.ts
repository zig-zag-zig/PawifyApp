import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { installModuleFake } from './helpers/moduleFakes.js';

process.env.DAPR_HTTP_ENDPOINT = 'http://dapr.test';

const originalFetch = globalThis.fetch;
const pushTokenStoreState = {
    deletedPushTokens: [] as string[],
    storedPushTokens: [] as string[],
};

installModuleFake('../../src/services/firebase/pushTokenStore.js', {
    async getPushTokensFromDb() {
        return pushTokenStoreState.storedPushTokens;
    },
    async deletePushTokensFromDb(_userId: string, pushTokens: string[]) {
        pushTokenStoreState.deletedPushTokens.push(...pushTokens);
    },
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    pushTokenStoreState.deletedPushTokens = [];
    pushTokenStoreState.storedPushTokens = [];
});

describe('push notification delivery', () => {
    it('filters invalid Expo tokens, deletes them, and honors excluded source tokens', async () => {
        pushTokenStoreState.storedPushTokens = [
            'ExpoPushToken[valid_1]',
            'invalid-token',
            'ExpoPushToken[valid_2]',
            'ExpoPushToken[valid_2]',
        ];
        const { getValidPushTokens } =
            await import('../src/services/notifications/pushNotificationDelivery.js');

        const validTokens = await getValidPushTokens('user-1', {
            excludePushToken: 'ExpoPushToken[valid_2]',
        });

        assert.deepEqual(validTokens, ['ExpoPushToken[valid_1]']);
        assert.deepEqual(pushTokenStoreState.deletedPushTokens, ['invalid-token']);
    });

    it('removes push tokens rejected by Expo tickets', async () => {
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            assert.equal(
                String(input),
                'http://dapr.test/v1.0/invoke/expo/method/--/api/v2/push/send',
            );
            const messages = JSON.parse(String(init?.body)) as unknown[];
            assert.equal(messages.length, 2);

            return new Response(
                JSON.stringify({
                    data: [
                        { status: 'error', message: 'Transient Expo error' },
                        {
                            status: 'error',
                            message: 'Device not registered',
                            details: {
                                expoPushToken: 'ExpoPushToken[rejected]',
                            },
                        },
                    ],
                }),
                { status: 200 },
            );
        }) as typeof fetch;
        const { sendPushNotificationToTokens } =
            await import('../src/services/notifications/pushNotificationDelivery.js');

        const sent = await sendPushNotificationToTokens(
            'user-1',
            ['ExpoPushToken[valid]', 'ExpoPushToken[rejected]'],
            {
                title: 'New release',
                body: 'Released today',
            },
        );

        assert.equal(sent, true);
        assert.deepEqual(pushTokenStoreState.deletedPushTokens, ['ExpoPushToken[rejected]']);
    });
});

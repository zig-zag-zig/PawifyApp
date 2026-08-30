import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

describe('Dapr Expo push migration', () => {
    it('chunks push sends through the Expo Dapr endpoint', async () => {
        const sendBatchSizes: number[] = [];
        installFetch((url, init) => {
            assert.equal(url, 'http://dapr.test/v1.0/invoke/expo/method/--/api/v2/push/send');
            const messages = JSON.parse(String(init.body)) as unknown[];
            sendBatchSizes.push(messages.length);
            return new Response(
                JSON.stringify({
                    data: messages.map((_, index) => ({
                        status: 'ok',
                        id: `ticket-${sendBatchSizes.length}-${index}`,
                    })),
                }),
                { status: 200 },
            );
        });

        const { sendPushNotificationToTokens } =
            await import('../../../src/services/notifications/pushNotificationDelivery.js');
        const tokens = Array.from({ length: 101 }, (_, index) => `ExpoPushToken[token_${index}]`);
        const sent = await sendPushNotificationToTokens('user-1', tokens, {
            title: 'Hello',
            body: 'World',
        });

        assert.equal(sent, true);
        assert.deepEqual(sendBatchSizes, [100, 1]);
    });
});

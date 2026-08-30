import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

describe('expoPushClient', () => {
    describe('sendExpoPushNotifications', () => {
        it('sends messages via Dapr HTTP and returns tickets', async () => {
            installFetch((url, init) => {
                assert.equal(url, 'http://dapr.test/v1.0/invoke/expo/method/--/api/v2/push/send');
                const body = JSON.parse(String(init.body)) as unknown[];
                assert.equal(body.length, 2);
                return new Response(
                    JSON.stringify({
                        data: [
                            { status: 'ok', id: 'ticket-1' },
                            { status: 'ok', id: 'ticket-2' },
                        ],
                    }),
                    { status: 200 },
                );
            });

            const { sendExpoPushNotifications } =
                await import('../../../src/services/notifications/expoPushClient.js');

            const tickets = await sendExpoPushNotifications([
                { to: 'ExpoPushToken[abc]', title: 'Hello', body: 'World' },
                { to: 'ExpoPushToken[def]', title: 'Hi', body: 'There' },
            ]);

            assert.equal(tickets.length, 2);
            assert.deepEqual(tickets[0], { status: 'ok', id: 'ticket-1' });
            assert.deepEqual(tickets[1], { status: 'ok', id: 'ticket-2' });
        });

        it('throws on HTTP error response from Expo', async () => {
            installFetch(() => new Response('rate limited', { status: 429 }));

            const { sendExpoPushNotifications } =
                await import('../../../src/services/notifications/expoPushClient.js');

            await assert.rejects(
                () => sendExpoPushNotifications([{ to: 'token', title: 'Test' }]),
                /send Expo push notifications.*429/,
            );
        });

        it('handles response body without data wrapper', async () => {
            installFetch(
                () =>
                    new Response(JSON.stringify([{ status: 'ok', id: 'ticket-1' }]), {
                        status: 200,
                    }),
            );

            const { sendExpoPushNotifications } =
                await import('../../../src/services/notifications/expoPushClient.js');

            const tickets = await sendExpoPushNotifications([{ to: 'token' }]);

            assert.equal(tickets.length, 1);
            assert.equal(tickets[0]!.status, 'ok');
        });

        it('handles empty response body', async () => {
            installFetch(() => new Response('', { status: 200 }));

            const { sendExpoPushNotifications } =
                await import('../../../src/services/notifications/expoPushClient.js');

            const result = await sendExpoPushNotifications([{ to: 'token' }]);
            assert.equal(result, undefined);
        });
    });

    describe('getExpoPushReceipts', () => {
        it('fetches receipts by ID via Dapr HTTP', async () => {
            installFetch((url, init) => {
                assert.equal(
                    url,
                    'http://dapr.test/v1.0/invoke/expo/method/--/api/v2/push/getReceipts',
                );
                const body = JSON.parse(String(init.body)) as Record<string, unknown>;
                assert.deepEqual(body, { ids: ['receipt-1', 'receipt-2'] });
                return new Response(
                    JSON.stringify({
                        data: {
                            'receipt-1': { status: 'ok' },
                            'receipt-2': {
                                status: 'error',
                                message: 'DeviceNotRegistered',
                                details: { error: 'DeviceNotRegistered', expoPushToken: 'token-2' },
                            },
                        },
                    }),
                    { status: 200 },
                );
            });

            const { getExpoPushReceipts } =
                await import('../../../src/services/notifications/expoPushClient.js');

            const receipts = await getExpoPushReceipts(['receipt-1', 'receipt-2']);

            assert.deepEqual(receipts['receipt-1'], { status: 'ok' });
            assert.equal(receipts['receipt-2']!.status, 'error');
        });

        it('throws on HTTP error from Expo receipts endpoint', async () => {
            installFetch(() => new Response('server error', { status: 500 }));

            const { getExpoPushReceipts } =
                await import('../../../src/services/notifications/expoPushClient.js');

            await assert.rejects(
                () => getExpoPushReceipts(['receipt-1']),
                /get Expo push receipts.*500/,
            );
        });
    });
});

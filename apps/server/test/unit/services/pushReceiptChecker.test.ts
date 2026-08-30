import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';
import { installModuleFake } from '../../helpers/moduleFakes.js';

const requireForTest = createRequire(__filename);

/**
 * pushReceiptChecker statically imports pushTokenStoreAdapter, which
 * dynamically imports pushTokenStore.  Between tests we must clear
 * all three module caches so that installModuleFake takes effect
 * on a fresh module graph.
 */
const clearReceiptCheckerModuleCache = () => {
    const modules = [
        '../../../src/services/notifications/pushReceiptChecker.js',
        '../../../src/services/notifications/pushTokenStoreAdapter.js',
        '../../../src/services/firebase/pushTokenStore.js',
    ];
    for (const mod of modules) {
        const resolved = requireForTest.resolve(mod);
        delete requireForTest.cache[resolved];
    }
};

describe('pushReceiptChecker', () => {
    beforeEach(() => {
        mock.timers.enable();
        mock.timers.setTime(Date.now());
        clearReceiptCheckerModuleCache();
    });

    afterEach(() => {
        mock.timers.reset();
    });

    it('swallows errors from receipt checking and logs instead of throwing', async () => {
        installFetch((url) => {
            if (url.includes('/push/getReceipts')) {
                throw new Error('network failure');
            }
            if (url.includes('/state/pawify-state')) {
                return new Response(null, { status: 204 });
            }
            return new Response('not found', { status: 404 });
        });

        installModuleFake('../../src/services/firebase/pushTokenStore.js', {
            deletePushTokensFromDb: async () => {},
            getPushTokensFromDb: async () => [],
            deleteDevicePushTokenFromDb: async () => {},
            deleteUserPushTokensFromDb: async () => {},
            savePushTokenToDb: async () => {},
            deletePushTokenFromDb: async () => {},
        });

        const { checkPushReceipts } =
            await import('../../../src/services/notifications/pushReceiptChecker.js');
        const receiptTokens = new Map([['receipt-1', 'ExpoPushToken[abc]']]);

        const promise = checkPushReceipts('user-1', 'visible', 'testEvent', receiptTokens);
        await mock.timers.runAll();
        await promise;
    });

    it('identifies DeviceNotRegistered receipts and removes invalid tokens', async () => {
        const deletedTokens: string[] = [];

        installFetch((url) => {
            if (url.includes('/push/getReceipts')) {
                return new Response(
                    JSON.stringify({
                        data: {
                            'receipt-1': {
                                status: 'error',
                                message: 'DeviceNotRegistered',
                                details: {
                                    error: 'DeviceNotRegistered',
                                    expoPushToken: 'ExpoPushToken[bad1]',
                                },
                            },
                            'receipt-2': { status: 'ok' },
                        },
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('/state/pawify-state')) {
                return new Response(null, { status: 204 });
            }
            return new Response('not found', { status: 404 });
        });

        installModuleFake('../../src/services/firebase/pushTokenStore.js', {
            deletePushTokensFromDb: async (_userId: string, tokens: string[]) => {
                deletedTokens.push(...tokens);
            },
            getPushTokensFromDb: async () => [],
            deleteDevicePushTokenFromDb: async () => {},
            deleteUserPushTokensFromDb: async () => {},
            savePushTokenToDb: async () => {},
            deletePushTokenFromDb: async () => {},
        });

        const { checkPushReceipts } =
            await import('../../../src/services/notifications/pushReceiptChecker.js');
        const receiptTokens = new Map([
            ['receipt-1', 'ExpoPushToken[bad1]'],
            ['receipt-2', 'ExpoPushToken[good2]'],
        ]);

        const promise = checkPushReceipts('user-1', 'visible', 'testEvent', receiptTokens);
        await mock.timers.runAll();
        await promise;

        assert.deepEqual(deletedTokens, ['ExpoPushToken[bad1]']);
    });

    it('does not delete tokens for non-DeviceNotRegistered errors', async () => {
        const deletedTokens: string[] = [];

        installFetch((url) => {
            if (url.includes('/push/getReceipts')) {
                return new Response(
                    JSON.stringify({
                        data: {
                            'receipt-1': {
                                status: 'error',
                                message: 'MessageTooBig',
                                details: { error: 'MessageTooBig' },
                            },
                        },
                    }),
                    { status: 200 },
                );
            }
            if (url.includes('/state/pawify-state')) {
                return new Response(null, { status: 204 });
            }
            return new Response('not found', { status: 404 });
        });

        installModuleFake('../../src/services/firebase/pushTokenStore.js', {
            deletePushTokensFromDb: async (_userId: string, tokens: string[]) => {
                deletedTokens.push(...tokens);
            },
            getPushTokensFromDb: async () => [],
            deleteDevicePushTokenFromDb: async () => {},
            deleteUserPushTokensFromDb: async () => {},
            savePushTokenToDb: async () => {},
            deletePushTokenFromDb: async () => {},
        });

        const { checkPushReceipts } =
            await import('../../../src/services/notifications/pushReceiptChecker.js');
        const receiptTokens = new Map([['receipt-1', 'ExpoPushToken[abc]']]);

        const promise = checkPushReceipts('user-1', 'visible', 'testEvent', receiptTokens);
        await mock.timers.runAll();
        await promise;

        assert.equal(deletedTokens.length, 0);
    });
});

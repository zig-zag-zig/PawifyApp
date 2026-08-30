import { createLogger } from '../../common/logging/logger.js';
import { chunkArray } from '../../common/utils/array.js';
import { getExpoPushReceipts } from './expoPushClient.js';
import { deletePushTokensFromStore } from './pushTokenStoreAdapter.js';
import type {
    ExpoPushReceipt,
    ExpoPushReceiptId,
    NotificationMode,
} from './pushNotificationTypes.js';

const logger = createLogger('services.notifications.pushReceipts');
const pushReceiptCheckDelayMs = 15_000;
const pushReceiptChunkSize = 300;

const wait = async (ms: number): Promise<void> => {
    await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, ms);
        timeout.unref?.();
    });
};

const getReceiptInvalidToken = (
    receipt: ExpoPushReceipt,
    fallbackPushToken: string | undefined,
): string | null => {
    if (receipt.status !== 'error' || receipt.details?.error !== 'DeviceNotRegistered') {
        return null;
    }

    return typeof receipt.details.expoPushToken === 'string'
        ? receipt.details.expoPushToken
        : (fallbackPushToken ?? null);
};

const isDeviceNotRegisteredReceipt = (receipt: ExpoPushReceipt): boolean =>
    receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered';

export const checkPushReceipts = async (
    userId: string,
    mode: NotificationMode,
    eventName: string | undefined,
    receiptTokens: Map<ExpoPushReceiptId, string>,
): Promise<void> => {
    try {
        await wait(pushReceiptCheckDelayMs);

        const receiptIds = Array.from(receiptTokens.keys());
        const chunks = chunkArray(receiptIds, pushReceiptChunkSize);
        const invalidTokens: string[] = [];

        await Promise.all(
            chunks.map(async (chunk) => {
                const receipts = await getExpoPushReceipts(chunk);

                Object.entries(receipts).forEach(([receiptId, receipt]) => {
                    if (receipt.status !== 'error') {
                        return;
                    }

                    const receiptMetadata = {
                        userId,
                        mode,
                        eventName,
                        receiptId,
                        message: receipt.message,
                        details: receipt.details,
                    };
                    if (isDeviceNotRegisteredReceipt(receipt)) {
                        logger.info(
                            'expo push receipt rejected for unregistered device',
                            receiptMetadata,
                        );
                    } else {
                        logger.warn('expo push receipt rejected', receiptMetadata);
                    }

                    const invalidToken = getReceiptInvalidToken(
                        receipt,
                        receiptTokens.get(receiptId),
                    );
                    if (invalidToken) {
                        invalidTokens.push(invalidToken);
                    }
                });
            }),
        );

        if (invalidTokens.length > 0) {
            logger.info('removing receipt-rejected expo push tokens', {
                userId,
                rejectedPushRecipientCount: invalidTokens.length,
            });
            await deletePushTokensFromStore(userId, invalidTokens);
        }
    } catch (error) {
        logger.error('push receipt check failed', {
            userId,
            mode,
            eventName,
            receiptCount: receiptTokens.size,
            error,
        });
    }
};

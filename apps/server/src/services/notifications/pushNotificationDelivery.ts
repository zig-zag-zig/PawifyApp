import { chunkArray } from '../../common/utils/array.js';
import { createLogger } from '../../common/logging/logger.js';
import { sendExpoPushNotifications } from './expoPushClient.js';
import {
    buildExpoPushMessages,
    isExpoPushToken,
    validateNotificationOptions,
} from './pushNotificationPayloads.js';
import { deletePushTokensFromStore, getPushTokensFromStore } from './pushTokenStoreAdapter.js';
import type {
    ExpoPushReceiptId,
    ExpoPushTicket,
    NotificationMode,
    PushDeliveryOptions,
    PushNotificationOptions,
} from './pushNotificationTypes.js';
import { checkPushReceipts } from './pushReceiptChecker.js';

export type { PushDeliveryOptions, PushNotificationOptions } from './pushNotificationTypes.js';

const logger = createLogger('services.notifications.pushDelivery');
const pushSendChunkSize = 100;

export const getValidPushTokens = async (
    userId: string,
    deliveryOptions: PushDeliveryOptions = {},
): Promise<string[]> => {
    const startedAt = Date.now();
    const storedPushTokens = await getPushTokensFromStore(userId);
    const pushTokens = Array.from(new Set(storedPushTokens));
    const totalTokenCount = pushTokens.length;
    const excludedPushToken = deliveryOptions.excludePushToken?.trim();

    if (pushTokens.length === 0) {
        logger.debug('no push tokens found', { userId });
        logger.debug('push token validation completed', {
            userId,
            pushRecipientsTotal: totalTokenCount,
            pushRecipientsValid: 0,
            pushRecipientsInvalid: 0,
            durationMs: Date.now() - startedAt,
        });
        return [];
    }

    const validPushTokens = pushTokens.filter((token) => isExpoPushToken(token));
    const invalidPushTokens = storedPushTokens.filter((token) => !isExpoPushToken(token));
    const recipientPushTokens = excludedPushToken
        ? validPushTokens.filter((token) => token !== excludedPushToken)
        : validPushTokens;
    const excludedPushRecipientCount = validPushTokens.length - recipientPushTokens.length;

    if (invalidPushTokens.length > 0) {
        logger.warn('removing invalid expo push tokens', {
            userId,
            invalidPushRecipientCount: invalidPushTokens.length,
        });
        await deletePushTokensFromStore(userId, invalidPushTokens);
    }

    if (recipientPushTokens.length === 0) {
        const allValidRecipientsExcluded =
            validPushTokens.length > 0 && excludedPushRecipientCount === validPushTokens.length;
        if (allValidRecipientsExcluded) {
            logger.debug('push notification recipients excluded', {
                userId,
                excludedPushRecipientCount,
            });
        } else {
            logger.debug('no valid push tokens found', {
                userId,
                excludedPushRecipientCount,
            });
        }
        logger.debug('push token validation completed', {
            userId,
            pushRecipientsTotal: totalTokenCount,
            pushRecipientsValid: 0,
            pushRecipientsInvalid: invalidPushTokens.length,
            pushRecipientsExcluded: excludedPushRecipientCount,
            durationMs: Date.now() - startedAt,
        });
        return [];
    }

    logger.debug('push token validation completed', {
        userId,
        pushRecipientsTotal: totalTokenCount,
        pushRecipientsValid: recipientPushTokens.length,
        pushRecipientsInvalid: invalidPushTokens.length,
        pushRecipientsExcluded: excludedPushRecipientCount,
        durationMs: Date.now() - startedAt,
    });

    return recipientPushTokens;
};

export const sendPushNotificationToTokens = async (
    userId: string,
    validPushTokens: string[],
    options: PushNotificationOptions,
    mode?: NotificationMode,
): Promise<boolean> => {
    const startedAt = Date.now();
    const notificationMode = mode ?? validateNotificationOptions(options);

    if (validPushTokens.length === 0) {
        logger.debug('push notification skipped (no valid tokens)', {
            userId,
            mode: notificationMode,
            durationMs: Date.now() - startedAt,
        });
        return false;
    }

    const messagePayloads = buildExpoPushMessages(validPushTokens, options, notificationMode);
    const chunks = chunkArray(messagePayloads, pushSendChunkSize);
    logger.debug('push notification send started', {
        userId,
        mode: notificationMode,
        pushRecipientCount: validPushTokens.length,
        chunkCount: chunks.length,
    });
    const chunkTicketGroups = await Promise.all(
        chunks.map(async (chunk, chunkIndex) => {
            const chunkStartedAt = Date.now();
            const tickets = await sendExpoPushNotifications(chunk);

            logger.debug('push notification chunk completed', {
                userId,
                mode: notificationMode,
                chunkIndex: chunkIndex + 1,
                chunkCount: chunks.length,
                chunkSize: chunk.length,
                durationMs: Date.now() - chunkStartedAt,
            });

            return tickets;
        }),
    );
    const tickets = chunkTicketGroups.flat();
    const invalidTokens: string[] = [];
    const receiptTokens = new Map<ExpoPushReceiptId, string>();

    tickets.forEach((ticket: ExpoPushTicket, index) => {
        if (ticket.status === 'error') {
            const errorDetails = ticket.details;
            logger.warn('expo push ticket rejected', {
                userId,
                mode: notificationMode,
                index,
                message: ticket.message,
                details: errorDetails,
            });
            if (errorDetails && 'expoPushToken' in errorDetails) {
                const invalidToken =
                    typeof errorDetails.expoPushToken === 'string'
                        ? errorDetails.expoPushToken
                        : validPushTokens[index];
                invalidTokens.push(invalidToken);
            }
            return;
        }

        receiptTokens.set(ticket.id, validPushTokens[index]);
    });

    if (receiptTokens.size > 0) {
        void checkPushReceipts(userId, notificationMode, options.eventName, receiptTokens);
    }

    if (invalidTokens.length > 0) {
        logger.warn('removing rejected expo push tokens', {
            userId,
            rejectedPushRecipientCount: invalidTokens.length,
        });
        await deletePushTokensFromStore(userId, invalidTokens);
    }

    logger.debug('push notification send completed', {
        userId,
        mode: notificationMode,
        pushRecipientCount: validPushTokens.length,
        chunkCount: chunks.length,
        ticketCount: tickets.length,
        rejectedPushRecipientCount: invalidTokens.length,
        receiptCount: receiptTokens.size,
        durationMs: Date.now() - startedAt,
    });

    return true;
};

export const sendPushNotification = async (
    userId: string,
    options: PushNotificationOptions,
    deliveryOptions: PushDeliveryOptions = {},
): Promise<void> => {
    try {
        const startedAt = Date.now();
        const mode = validateNotificationOptions(options);

        logger.debug('push notification request started', {
            userId,
            mode,
        });

        const validPushTokens = await getValidPushTokens(userId, deliveryOptions);
        await sendPushNotificationToTokens(userId, validPushTokens, options, mode);

        logger.debug('push notification request completed', {
            userId,
            mode,
            durationMs: Date.now() - startedAt,
        });
    } catch (error) {
        logger.error('send push notification failed', { userId, error });
        throw error;
    }
};

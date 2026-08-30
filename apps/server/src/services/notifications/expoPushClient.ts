import { invokeHttpEndpoint } from '../../infrastructure/dapr/daprHttp.js';
import type {
    ExpoPushMessage,
    ExpoPushReceipt,
    ExpoPushReceiptId,
    ExpoPushTicket,
} from './pushNotificationTypes.js';

const readExpoData = async <T>(response: Response, context: string): Promise<T> => {
    const bodyText = await response.text();
    if (!response.ok) {
        throw new Error(`${context}: HTTP ${response.status} ${bodyText}`);
    }

    const body = bodyText ? (JSON.parse(bodyText) as unknown) : undefined;
    if (body && typeof body === 'object' && 'data' in body) {
        return (body as { data: T }).data;
    }

    return body as T;
};

export const sendExpoPushNotifications = async (
    messages: ExpoPushMessage[],
): Promise<ExpoPushTicket[]> => {
    const response = await invokeHttpEndpoint('expo', '/--/api/v2/push/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
    });

    return await readExpoData<ExpoPushTicket[]>(response, 'send Expo push notifications');
};

export const getExpoPushReceipts = async (
    ids: ExpoPushReceiptId[],
): Promise<Record<ExpoPushReceiptId, ExpoPushReceipt>> => {
    const response = await invokeHttpEndpoint('expo', '/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
    });

    return await readExpoData<Record<ExpoPushReceiptId, ExpoPushReceipt>>(
        response,
        'get Expo push receipts',
    );
};

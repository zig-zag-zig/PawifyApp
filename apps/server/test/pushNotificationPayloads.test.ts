import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    isExpoPushToken,
    validateNotificationOptions,
    buildExpoPushMessages,
} from '../src/services/notifications/pushNotificationPayloads.js';

describe('isExpoPushToken', () => {
    it('returns true for ExpoPushToken format', () => {
        assert.equal(isExpoPushToken('ExpoPushToken[abc123]'), true);
    });

    it('returns true for ExponentPushToken format', () => {
        assert.equal(isExpoPushToken('ExponentPushToken[abc123]'), true);
    });

    it('returns false for invalid token', () => {
        assert.equal(isExpoPushToken('invalid-token'), false);
    });

    it('returns false for empty string', () => {
        assert.equal(isExpoPushToken(''), false);
    });

    it('accepts tokens with underscores and hyphens', () => {
        assert.equal(isExpoPushToken('ExpoPushToken[abc-123_XYZ]'), true);
    });
});

describe('validateNotificationOptions', () => {
    it('returns visible mode for title + body', () => {
        assert.equal(validateNotificationOptions({ title: 'Hello', body: 'World' }), 'visible');
    });

    it('returns visible mode for title only', () => {
        assert.equal(validateNotificationOptions({ title: 'Hello' }), 'visible');
    });

    it('returns data mode for eventName only', () => {
        assert.equal(validateNotificationOptions({ eventName: 'releases' }), 'data');
    });

    it('throws when title and eventName are both provided', () => {
        assert.throws(
            () => validateNotificationOptions({ title: 'Hello', eventName: 'releases' }),
            /Visible notifications cannot contain data fields/,
        );
    });

    it('throws when title and payload are both provided', () => {
        assert.throws(
            () => validateNotificationOptions({ title: 'Hello', payload: { key: 'value' } }),
            /Visible notifications cannot contain data fields/,
        );
    });

    it('throws when neither title/body nor eventName is provided', () => {
        assert.throws(
            () => validateNotificationOptions({}),
            /Data notifications require eventName/,
        );
    });

    it('throws when data is not an object', () => {
        assert.throws(
            () => validateNotificationOptions({ title: 'Hello', data: 'bad' as any }),
            /data must be an object/,
        );
    });

    it('throws when data is provided for a data notification', () => {
        assert.throws(
            () => validateNotificationOptions({ eventName: 'releases', data: { key: 'value' } }),
            /Data notifications build data from eventName\/payload/,
        );
    });

    it('throws when payload is not an object', () => {
        assert.throws(
            () => validateNotificationOptions({ eventName: 'releases', payload: 'bad' as any }),
            /payload must be an object/,
        );
    });

    it('returns data mode when eventName and payload are provided', () => {
        assert.equal(
            validateNotificationOptions({ eventName: 'releases', payload: { key: 'value' } }),
            'data',
        );
    });
});

describe('buildExpoPushMessages', () => {
    it('builds visible mode messages with sound', () => {
        const messages = buildExpoPushMessages(
            ['ExpoPushToken[abc]'],
            { title: 'Hello', body: 'World' },
            'visible',
        );

        assert.equal(messages.length, 1);
        assert.equal(messages[0]!.to, 'ExpoPushToken[abc]');
        assert.equal(messages[0]!.title, 'Hello');
        assert.equal(messages[0]!.body, 'World');
        assert.equal(messages[0]!.sound, 'default');
        assert.equal(messages[0]!.data, undefined);
        assert.equal(messages[0]!._contentAvailable, undefined);
    });

    it('builds visible mode messages with attached data', () => {
        const messages = buildExpoPushMessages(
            ['ExpoPushToken[abc]'],
            {
                title: 'New release',
                body: 'By Artist',
                data: { eventName: 'releases', payload: { releaseId: 'release-1' } },
            },
            'visible',
        );

        assert.equal(messages[0]!.sound, 'default');
        assert.deepEqual(messages[0]!.data, {
            eventName: 'releases',
            payload: { releaseId: 'release-1' },
        });
    });

    it('builds data mode messages with _contentAvailable and priority', () => {
        const messages = buildExpoPushMessages(
            ['ExpoPushToken[abc]'],
            { eventName: 'releases', payload: { artistId: '1' } },
            'data',
        );

        assert.equal(messages.length, 1);
        assert.equal(messages[0]!.sound, undefined);
        assert.equal(messages[0]!._contentAvailable, true);
        assert.equal(messages[0]!.priority, 'high');
        assert.deepEqual(messages[0]!.data, {
            eventName: 'releases',
            payload: { artistId: '1' },
        });
    });

    it('creates one message per token', () => {
        const messages = buildExpoPushMessages(
            ['ExpoPushToken[a]', 'ExpoPushToken[b]'],
            { title: 'Hi' },
            'visible',
        );

        assert.equal(messages.length, 2);
        assert.equal(messages[0]!.to, 'ExpoPushToken[a]');
        assert.equal(messages[1]!.to, 'ExpoPushToken[b]');
    });

    it('returns empty array for empty token list', () => {
        const messages = buildExpoPushMessages([], { title: 'Hi' }, 'visible');
        assert.deepEqual(messages, []);
    });
});

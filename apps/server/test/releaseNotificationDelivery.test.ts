import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewRelease } from '@pawify/shared';

import { buildReleaseNotifications } from '../src/services/notifications/releaseNotificationContent.js';
import {
    deliverReleaseNotifications,
    type SendReleaseNotification,
} from '../src/services/notifications/releaseNotificationDelivery.js';
import type { PushNotificationOptions } from '../src/services/notifications/pushNotificationTypes.js';

const newRelease = (index: number): NewRelease => ({
    id: `release-${index}`,
    title: `Release ${index}`,
    date: '2025-04-18',
    disambiguation: null,
    artists: { 'artist-1': 'Aurora Test Ensemble' },
    date_for_display: '18 April 2025',
    'primary-type': 'Album',
});

const notificationsFor = (count: number) =>
    buildReleaseNotifications(Array.from({ length: count }, (_, index) => newRelease(index + 1)));

type SentPush = { options: PushNotificationOptions; mode: string | undefined };

const recorder = () => {
    const sent: SentPush[] = [];
    const send: SendReleaseNotification = async (options, mode) => {
        sent.push({ options, mode });
    };

    return {
        sent,
        send,
        visible: () => sent.filter((entry) => entry.mode === undefined),
        data: () => sent.filter((entry) => entry.mode === 'data'),
    };
};

describe('deliverReleaseNotifications', () => {
    it('sends nothing when the user has no valid push tokens', async () => {
        const { sent, send } = recorder();

        const result = await deliverReleaseNotifications(notificationsFor(5), {
            maxIndividual: 3,
            hasPushTokens: false,
            send,
        });

        assert.equal(result.visibleNotificationsSent, 0);
        assert.deepEqual(sent, []);
    });

    it('sends one visible push per release under the cap, plus a data push', async () => {
        const { send, visible, data } = recorder();

        const result = await deliverReleaseNotifications(notificationsFor(2), {
            maxIndividual: 3,
            hasPushTokens: true,
            send,
        });

        assert.equal(result.visibleNotificationsSent, 2);
        assert.equal(visible().length, 2);
        assert.equal(data().length, 1);
    });

    it('sends exactly the cap individually when the count matches it', async () => {
        const { send, visible } = recorder();

        const result = await deliverReleaseNotifications(notificationsFor(3), {
            maxIndividual: 3,
            hasPushTokens: true,
            send,
        });

        assert.equal(result.visibleNotificationsSent, 3);
        assert.equal(visible().length, 3);
    });

    it('collapses the overflow past the cap into a single digest push', async () => {
        const { send, visible } = recorder();

        const result = await deliverReleaseNotifications(notificationsFor(5), {
            maxIndividual: 3,
            hasPushTokens: true,
            send,
        });

        // 3 individual + 1 digest
        assert.equal(result.visibleNotificationsSent, 4);
        assert.equal(visible().length, 4);

        const digest = visible()[3].options;
        assert.equal(digest.title, '2 more new releases from your artists');
        assert.equal(
            digest.body,
            'Release 4 — Aurora Test Ensemble\nRelease 5 — Aurora Test Ensemble',
        );
        // The digest carries no release id, so its tap lands on the Releases tab.
        assert.deepEqual(digest.data, { eventName: 'releases' });
    });

    it('sends a data-only push tagged with the releases event', async () => {
        const { send, data } = recorder();

        await deliverReleaseNotifications(notificationsFor(1), {
            maxIndividual: 3,
            hasPushTokens: true,
            send,
        });

        assert.equal(data().length, 1);
        assert.deepEqual(data()[0].options, { eventName: 'releases' });
    });

    it('keeps the release id on each individual push so taps deep-link', async () => {
        const { send, visible } = recorder();

        await deliverReleaseNotifications(notificationsFor(3), {
            maxIndividual: 3,
            hasPushTokens: true,
            send,
        });

        assert.deepEqual(
            visible().map((entry) => entry.options.data?.payload),
            [{ releaseId: 'release-1' }, { releaseId: 'release-2' }, { releaseId: 'release-3' }],
        );
    });

    it('sends no visible push for an empty release list', async () => {
        const { send, visible, data } = recorder();

        const result = await deliverReleaseNotifications([], {
            maxIndividual: 3,
            hasPushTokens: true,
            send,
        });

        assert.equal(result.visibleNotificationsSent, 0);
        assert.equal(visible().length, 0);
        assert.equal(data().length, 1);
    });

    it('sends everything as a digest when the cap is zero', async () => {
        const { send, visible } = recorder();

        const result = await deliverReleaseNotifications(notificationsFor(2), {
            maxIndividual: 0,
            hasPushTokens: true,
            send,
        });

        assert.equal(result.visibleNotificationsSent, 1);
        assert.equal(visible().length, 1);
        assert.equal(visible()[0].options.title, '2 more new releases from your artists');
    });
});

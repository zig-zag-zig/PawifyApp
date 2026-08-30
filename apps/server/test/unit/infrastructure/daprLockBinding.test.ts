import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFetch } from '../../helpers/daprTestHelpers.js';

describe('Dapr lock, binding, and secret migration', () => {
    it('acquires and releases the notifyNewReleases distributed lock through Dapr', async () => {
        const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
        installFetch((url, init) => {
            requests.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        });

        const { acquireNotifyNewReleasesLock, releaseNotifyNewReleasesLock } =
            await import('../../../src/services/firebase/notificationRunLockStore.js');

        const lock = await acquireNotifyNewReleasesLock();
        assert.ok(lock);
        await releaseNotifyNewReleasesLock(lock);

        assert.equal(requests[0].url, 'http://dapr.test/v1.0-alpha1/lock/pawify-lock');
        assert.equal(requests[0].body.resourceId, 'notifyNewReleases');
        assert.equal(requests[0].body.expiryInSeconds, 3601);
        assert.equal(requests[1].url, 'http://dapr.test/v1.0-alpha1/unlock/pawify-lock');
        assert.equal(requests[1].body.lockOwner, lock.ownerId);
    });

    it('returns null when Dapr reports a lock conflict', async () => {
        installFetch(() => new Response(null, { status: 409 }));

        const { acquireNotifyNewReleasesLock } =
            await import('../../../src/services/firebase/notificationRunLockStore.js');

        assert.equal(await acquireNotifyNewReleasesLock(), null);
    });

    it('sends OTP email through the Dapr SMTP binding', async () => {
        let requestBody: Record<string, any> | undefined;
        installFetch((url, init) => {
            assert.equal(url, 'http://dapr.test/v1.0/bindings/smtp-gmail');
            requestBody = JSON.parse(String(init.body)) as Record<string, any>;
            return new Response(null, { status: 204 });
        });

        const { sendOtpEmail } = await import('../../../src/services/emailService.js');
        await sendOtpEmail('person@example.com', '123456', 10);

        assert.equal(requestBody?.operation, 'create');
        assert.equal(requestBody?.metadata.emailTo, 'person@example.com');
        assert.equal(requestBody?.metadata.subject, 'Your Password Reset OTP');
        assert.match(String(requestBody?.data), /123456/);
        assert.match(String(requestBody?.data), /10 minutes/);
    });

    it('reads optional provider tokens from Dapr secrets', async () => {
        const calls: string[] = [];
        installFetch((url) => {
            calls.push(url);
            return new Response(JSON.stringify({ 'discogs-token': 'discogs-secret' }), {
                status: 200,
            });
        });

        const { clearDaprSecretCache, getDaprSecret } =
            await import('../../../src/infrastructure/dapr/daprSecrets.js');
        clearDaprSecretCache();

        assert.equal(await getDaprSecret('discogs-token'), 'discogs-secret');
        assert.equal(await getDaprSecret('discogs-token'), 'discogs-secret');
        assert.equal(calls.length, 1);
        assert.equal(calls[0], 'http://dapr.test/v1.0/secrets/pawify-secrets/discogs-token');
    });
});

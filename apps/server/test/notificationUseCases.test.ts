import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createNotifyNewReleasesUseCase } from '../src/features/notifications/usecases/notifyNewReleases.js';
import type { NotificationUseCaseDependencies } from '../src/features/notifications/ports.js';

describe('notification use cases', () => {
    it('calls newReleaseNotificationGateway.notifyNewReleases', async () => {
        let called = false;
        const deps: NotificationUseCaseDependencies = {
            newReleaseNotificationGateway: {
                async notifyNewReleases() {
                    called = true;
                },
            },
        };
        const useCase = createNotifyNewReleasesUseCase(deps);

        await useCase();

        assert.equal(called, true);
    });

    it('calls notifyNewReleases once per invocation', async () => {
        let callCount = 0;
        const deps: NotificationUseCaseDependencies = {
            newReleaseNotificationGateway: {
                async notifyNewReleases() {
                    callCount += 1;
                },
            },
        };
        const useCase = createNotifyNewReleasesUseCase(deps);

        await useCase();
        await useCase();
        await useCase();

        assert.equal(callCount, 3);
    });

    it('propagates gateway errors without wrapping', async () => {
        const deps: NotificationUseCaseDependencies = {
            newReleaseNotificationGateway: {
                async notifyNewReleases() {
                    throw new Error('lock failed');
                },
            },
        };
        const useCase = createNotifyNewReleasesUseCase(deps);

        await assert.rejects(
            () => useCase(),
            (error) => error instanceof Error && error.message === 'lock failed',
        );
    });
});

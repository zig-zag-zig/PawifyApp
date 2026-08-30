import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../services/pushTokenStorage', () => ({
    removeStoredPushToken: vi.fn(async () => {}),
}));
vi.mock('../../../services/eventService', () => ({
    EventService: { setClientPushToken: vi.fn() },
}));

import {
    cleanupPostAuthDevice,
} from './postAuthSetupService';
import { removeStoredPushToken } from '../../../services/pushTokenStorage';
import { EventService } from '../../../services/eventService';

describe('cleanupPostAuthDevice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls the remote deletePushToken by default', async () => {
        const deletePushToken = vi.fn(async () => {});

        await cleanupPostAuthDevice(deletePushToken);

        expect(deletePushToken).toHaveBeenCalledTimes(1);
        expect(removeStoredPushToken).toHaveBeenCalledTimes(1);
        expect(EventService.setClientPushToken).toHaveBeenCalledWith(null);
    });

    it('still runs local cleanup when deletePushToken rejects', async () => {
        const deletePushToken = vi.fn(async () => {
            throw new Error('network');
        });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await cleanupPostAuthDevice(deletePushToken);

        expect(deletePushToken).toHaveBeenCalledTimes(1);
        expect(removeStoredPushToken).toHaveBeenCalledTimes(1);
        expect(EventService.setClientPushToken).toHaveBeenCalledWith(null);
        warnSpy.mockRestore();
    });

    it('skips the remote deletePushToken when skipRemotePushTokenCleanup is set', async () => {
        const deletePushToken = vi.fn(async () => {});

        await cleanupPostAuthDevice(deletePushToken, { skipRemotePushTokenCleanup: true });

        expect(deletePushToken).not.toHaveBeenCalled();
        expect(removeStoredPushToken).toHaveBeenCalledTimes(1);
        expect(EventService.setClientPushToken).toHaveBeenCalledWith(null);
    });
});
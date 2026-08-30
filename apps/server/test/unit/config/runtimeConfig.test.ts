import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * runtimeConfig values are computed once at module load from process.env.
 * Due to ESM caching, we can only test defaults (before any other test
 * has imported the module). Override testing is covered by envParsing.test.ts
 * which tests the individual parsing functions.
 */
describe('runtimeConfig', () => {
    describe('default values', () => {
        it('serverConfig defaults', async () => {
            const { serverConfig } = await import('../../../src/config/runtimeConfig.js');
            assert.equal(serverConfig.port, 10000);
            assert.equal(serverConfig.requestBodyLimit, '5mb');
        });

        it('cacheConfig has sensible defaults', async () => {
            const { cacheConfig } = await import('../../../src/config/runtimeConfig.js');
            assert.ok(cacheConfig.defaultTtlHours >= 1);
            assert.ok(cacheConfig.artistTtlHours >= 1);
            assert.ok(cacheConfig.transientArtistTtlHours >= 1);
            assert.ok(cacheConfig.releaseLyricsTtlHours >= 1);
        });

        it('musicApiConfig defaults', async () => {
            const { musicApiConfig } = await import('../../../src/config/runtimeConfig.js');
            assert.equal(musicApiConfig.musicBrainzUserAgent, 'MusicReleaseNotifier/1.0');
            assert.ok(musicApiConfig.musicBrainzDelayMs >= 1);
        });

        it('notificationConfig defaults', async () => {
            const { notificationConfig } = await import('../../../src/config/runtimeConfig.js');
            assert.equal(notificationConfig.notifyApiKey, undefined);
            assert.ok(notificationConfig.notifyNewReleasesLockTtlMs >= 1);
        });

        it('loggingConfig defaults', async () => {
            const { loggingConfig } = await import('../../../src/config/runtimeConfig.js');
            assert.equal(loggingConfig.level, 'info');
            assert.equal(loggingConfig.includeErrorStacks, false);
        });

        it('monitoringConfig defaults', async () => {
            const { monitoringConfig } = await import('../../../src/config/runtimeConfig.js');
            assert.equal(monitoringConfig.sentryEnabled, true);
        });

        it('backgroundTaskConfig defaults', async () => {
            const { backgroundTaskConfig } = await import('../../../src/config/runtimeConfig.js');
            assert.ok(backgroundTaskConfig.resultRetentionMs >= 1000);
            assert.ok(backgroundTaskConfig.maxConcurrency >= 1);
            assert.ok(backgroundTaskConfig.subtaskItemLimit >= 1);
        });

        it('backgroundTaskWorkerConfig defaults', async () => {
            const { backgroundTaskWorkerConfig } =
                await import('../../../src/config/runtimeConfig.js');
            assert.ok(backgroundTaskWorkerConfig.coverArtRequestConcurrency >= 1);
            assert.ok(backgroundTaskWorkerConfig.trackLyricsRequestConcurrency >= 1);
            assert.ok(backgroundTaskWorkerConfig.artistProfileImageRequestConcurrency >= 1);
        });
    });
});

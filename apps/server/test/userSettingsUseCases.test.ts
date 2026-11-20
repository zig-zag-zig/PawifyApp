import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installFirebaseServiceFake } from './helpers/moduleFakes.js';
import { createReleaseNotificationSettings } from './helpers/releaseFixtures.js';
import { createUserSettingsDependencies } from './helpers/userSettingsUseCaseFakes.js';
import {
    emptyKnownReleaseGroupState,
    type ReleaseEditionCandidate,
    type ReleaseGroupCandidate,
} from '../src/features/releases/domain/releaseGroupProcessing.js';

// Prevent Firebase store modules from loading and triggering firebaseInit.js
// which requires credentials. The fake prevents transitive load of firebaseInit.
installFirebaseServiceFake();


const catalogGroup = (
    id: string,
    date: string | null,
    officialEditions: ReleaseEditionCandidate[] = [],
): ReleaseGroupCandidate => ({
    id,
    title: id,
    date,
    disambiguation: null,
    primaryType: 'Album',
    releaseIds: [`release-${id}`],
    newestReleaseId: `release-${id}`,
    newestReleaseDate: date,
    officialEditions,
});

const officialEdition = (
    releaseId: string,
    date: string | null,
): ReleaseEditionCandidate => ({
    releaseId,
    date,
    status: 'Official',
    trackCount: 12,
    formats: ['CD'],
    title: releaseId,
    disambiguation: null,
    editionKeywords: [],
});

describe('user settings use cases', () => {
    it('saves notification settings, rebuilds known releases, prunes new releases, and notifies clients', async () => {
        const { createUpdateReleaseNotificationSettingsUseCase } =
            await import('../src/features/userSettings/usecases/updateReleaseNotificationSettings.js');
        const nextSettings = createReleaseNotificationSettings();
        const state = createUserSettingsDependencies({
            catalog: {
                'artist-1': {
                    groups: [
                        catalogGroup('tracked', '2026-01-01'),
                        catalogGroup('missing-date', null),
                        catalogGroup('future', '2999-01-01'),
                    ],
                },
                'artist-2': {
                    groups: [catalogGroup('older-included', '2020-01-01')],
                },
            },
        });
        const useCase = createUpdateReleaseNotificationSettingsUseCase(state.dependencies);

        const result = await useCase('user-1', nextSettings, 'push-token-1');

        assert.deepEqual(result, nextSettings);
        assert.deepEqual(state.saveCalls, [nextSettings]);
        assert.deepEqual(
            state.replaceCalls.map(({ userId, artistId, groupState }) => ({
                userId,
                artistId,
                groupState: Array.from(groupState.entries()),
            })),
            [
                {
                    userId: 'user-1',
                    artistId: 'artist-1',
                    groupState: [
                        ['tracked', emptyKnownReleaseGroupState('', false)],
                        ['missing-date', emptyKnownReleaseGroupState('', false)],
                        ['future', emptyKnownReleaseGroupState('', false)],
                    ],
                },
                {
                    userId: 'user-1',
                    artistId: 'artist-2',
                    groupState: [
                        ['older-included', emptyKnownReleaseGroupState('', false)],
                    ],
                },
            ],
        );
        assert.deepEqual(state.removeCalls, [{ userId: 'user-1', settings: nextSettings }]);
        assert.deepEqual(state.notificationCalls.sort(), [
            'releases:push-token-1',
            'settings:push-token-1',
        ]);
    });

    it('keeps an old group with a recent Official edition and preserves its baseline', async () => {
        const { createUpdateReleaseNotificationSettingsUseCase } =
            await import('../src/features/userSettings/usecases/updateReleaseNotificationSettings.js');
        const nextSettings = createReleaseNotificationSettings({
            oldestReleaseDateMonths: 12,
            includeReleasesWithoutDate: false,
        });
        const existing = {
            lastNotifiedDate: '2020-01-01',
            maxOfficialTrackCount: 18,
            editionKeywords: ['deluxe'],
        };
        const state = createUserSettingsDependencies({
            catalog: {
                'artist-1': {
                    groups: [
                        catalogGroup('old-with-deluxe', '2001-01-01', [
                            officialEdition('recent-deluxe', '2026-05-01'),
                        ]),
                        catalogGroup('old-only', '2001-01-01'),
                    ],
                },
            },
            currentState: { 'artist-1': { 'old-with-deluxe': existing } },
            previousSettings: nextSettings,
        });
        const useCase = createUpdateReleaseNotificationSettingsUseCase(state.dependencies);

        await useCase('user-1', nextSettings);

        assert.deepEqual(
            Array.from(state.replaceCalls[0]?.groupState.entries() ?? []),
            [
                ['old-with-deluxe', existing],
                ['old-only', emptyKnownReleaseGroupState('', false)],
            ],
        );
    });

    it('keeps history for a group outside the narrowed date window', async () => {
        const { createUpdateReleaseNotificationSettingsUseCase } =
            await import('../src/features/userSettings/usecases/updateReleaseNotificationSettings.js');
        const nextSettings = createReleaseNotificationSettings({
            oldestReleaseDateMonths: 12,
            includeReleasesWithoutDate: false,
        });
        const historical = {
            lastNotifiedDate: '2015-01-01',
            maxOfficialTrackCount: 12,
            editionKeywords: [],
        };
        const state = createUserSettingsDependencies({
            catalog: {
                'artist-1': { groups: [catalogGroup('historical', '2015-01-01')] },
            },
            currentState: { 'artist-1': { historical } },
            previousSettings: nextSettings,
        });
        const useCase = createUpdateReleaseNotificationSettingsUseCase(state.dependencies);

        await useCase('user-1', nextSettings);

        assert.deepEqual(
            Array.from(state.replaceCalls[0]?.groupState.entries() ?? []),
            [['historical', historical]],
        );
    });

    it('does not rewrite state from an incomplete catalogue', async () => {
        const { createUpdateReleaseNotificationSettingsUseCase } =
            await import('../src/features/userSettings/usecases/updateReleaseNotificationSettings.js');
        const nextSettings = createReleaseNotificationSettings();
        const state = createUserSettingsDependencies({
            catalog: {
                'artist-1': {
                    complete: false,
                    groups: [catalogGroup('partial', '2026-01-01')],
                },
            },
        });
        const useCase = createUpdateReleaseNotificationSettingsUseCase(state.dependencies);

        await useCase('user-1', nextSettings);

        assert.deepEqual(state.replaceCalls, []);
    });

    it('does not rewrite known state before the canonical migration has run', async () => {
        const { createUpdateReleaseNotificationSettingsUseCase } =
            await import('../src/features/userSettings/usecases/updateReleaseNotificationSettings.js');
        const nextSettings = createReleaseNotificationSettings();
        const state = createUserSettingsDependencies({
            catalog: {
                'artist-1': {
                    complete: true,
                    groups: [catalogGroup('group-1', '2026-01-01')],
                },
            },
            unmigratedArtistIds: ['artist-1'],
        });
        const useCase = createUpdateReleaseNotificationSettingsUseCase(state.dependencies);

        await useCase('user-1', nextSettings);

        assert.deepEqual(state.replaceCalls, []);
    });

    it('rolls settings back and skips notifications when known release rebuild fails', async () => {
        const { createUpdateReleaseNotificationSettingsUseCase } =
            await import('../src/features/userSettings/usecases/updateReleaseNotificationSettings.js');
        const previousSettings = createReleaseNotificationSettings({
            oldestReleaseDateMonths: 12,
            includeReleasesWithoutDate: true,
        });
        const nextSettings = createReleaseNotificationSettings();
        const state = createUserSettingsDependencies({
            catalog: {
                'artist-1': { groups: [catalogGroup('tracked', '2026-01-01')] },
                'artist-2': { groups: [catalogGroup('never-read', '2026-01-01')] },
            },
            failArtistId: 'artist-2',
            previousSettings,
        });
        const useCase = createUpdateReleaseNotificationSettingsUseCase(state.dependencies);

        await assert.rejects(
            () => useCase('user-1', nextSettings, 'push-token-1'),
            /catalog failed/,
        );

        assert.deepEqual(state.saveCalls, [nextSettings, previousSettings]);
        assert.deepEqual(state.notificationCalls, []);
    });

    it('getReleaseNotificationSettings returns stored settings', async () => {
        const { createGetReleaseNotificationSettingsUseCase } =
            await import('../src/features/userSettings/usecases/getReleaseNotificationSettings.js');
        const settings = createReleaseNotificationSettings({ oldestReleaseDateMonths: 6 });
        const deps = {
            releaseNotificationSettingsRepository: {
                async getSettings(_userId: string) {
                    return settings;
                },
                async saveSettings() {
                    throw new Error('should not run');
                },
            },
        };

        const useCase = createGetReleaseNotificationSettingsUseCase(deps);
        const result = await useCase('user-1');

        assert.deepEqual(result, settings);
        assert.equal(result.oldestReleaseDateMonths, 6);
    });
});

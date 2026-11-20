import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { installModuleFake } from '../../helpers/moduleFakes.js';
import type { ReleaseGroupCandidate } from '../../../src/features/releases/domain/releaseGroupProcessing.js';

const group = (): ReleaseGroupCandidate => ({
    id: 'group-1',
    title: 'Album',
    date: '2026-01-01',
    disambiguation: '',
    primaryType: 'Album',
    releaseIds: ['release-1'],
    newestReleaseId: 'release-1',
    newestReleaseDate: '2026-01-01',
    officialEditions: [
        {
            releaseId: 'release-1',
            date: '2026-01-01',
            status: 'Official',
            trackCount: 12,
            formats: ['CD'],
            title: 'Album',
            disambiguation: null,
            editionKeywords: [],
        },
    ],
});

describe('processArtistReleases enrichment failures', () => {
    it('still persists detection state when cover caching fails', async () => {
        let savedGroupCount = -1;
        installModuleFake('../../src/services/coverArtService.js', {
            getReleaseCover: async () => {
                throw new Error('mirror unavailable');
            },
        });
        installModuleFake('../../src/services/firebase/artistStore.js', {
            saveArtistAndKnownReleasesToDb: async (
                _userId: string,
                _artistId: string,
                groupState: Map<string, unknown>,
            ) => {
                savedGroupCount = groupState.size;
            },
        });
        installModuleFake('../../src/services/firebase/newReleaseMaintenance.js', {
            getCurrentReleaseGroupState: async () => ({}),
            removePrunedNewReleaseGroups: async () => false,
        });
        installModuleFake('../../src/infrastructure/musicDb/musicDbRepositories.js', {
            getReleaseGroupCreditsFromMirror: () => new Map(),
        });

        const { processArtistReleases } =
            await import('../../../src/utils/helpers/newReleaseHelpers.js');
        const result = await processArtistReleases(
            'user-1',
            'artist-1',
            async () => ({
                groups: [group()],
                creditsByGroupId: new Map(),
                complete: true,
            }),
            { 'artist-1': {} },
        );

        assert.equal(result.newReleases.length, 1);
        assert.equal(savedGroupCount, 1);
    });
});

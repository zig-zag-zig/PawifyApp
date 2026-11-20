import { describe, expect, it } from 'vitest';
import { decideReleaseGroupNavigation } from './releaseGroupNavigation';

describe('decideReleaseGroupNavigation', () => {
    it('opens the only release directly', () => {
        expect(
            decideReleaseGroupNavigation({
                releaseGroupId: 'group-1',
                releaseIds: ['release-1'],
            }),
        ).toEqual({ screen: 'Release', releaseId: 'release-1' });
    });

    it('opens the group for multiple releases', () => {
        expect(
            decideReleaseGroupNavigation({
                releaseGroupId: 'group-1',
                releaseIds: ['release-1', 'release-2'],
            }),
        ).toEqual({ screen: 'ReleaseGroup', releaseGroupId: 'group-1' });
    });

    it('uses the known count and representative release when ids are absent', () => {
        expect(
            decideReleaseGroupNavigation({
                releaseGroupId: 'group-1',
                releaseCount: 1,
                fallbackReleaseId: 'release-1',
            }),
        ).toEqual({ screen: 'Release', releaseId: 'release-1' });
        expect(
            decideReleaseGroupNavigation({
                releaseGroupId: 'group-1',
                releaseCount: 2,
                fallbackReleaseId: 'release-1',
            }),
        ).toEqual({ screen: 'ReleaseGroup', releaseGroupId: 'group-1' });
    });

    it('looks up unknown groups instead of guessing', () => {
        expect(decideReleaseGroupNavigation({ releaseGroupId: 'group-1' })).toEqual({
            screen: 'Lookup',
            releaseGroupId: 'group-1',
        });
        expect(
            decideReleaseGroupNavigation({
                releaseGroupId: 'group-1',
                releaseCount: 1,
            }),
        ).toEqual({ screen: 'Lookup', releaseGroupId: 'group-1' });
    });

    it('opens a feed release directly when it has no group identity', () => {
        expect(
            decideReleaseGroupNavigation({
                releaseGroupId: null,
                fallbackReleaseId: 'release-1',
            }),
        ).toEqual({ screen: 'Release', releaseId: 'release-1' });
    });
});

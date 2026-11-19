import { describe, expect, it } from 'vitest';
import { resolveReleaseFeedNavigation } from './releaseFeedNavigation';

describe('resolveReleaseFeedNavigation', () => {
    it('opens the release group when the feed entry has several releases', () => {
        expect(
            resolveReleaseFeedNavigation({
                id: 'release-1',
                releaseGroupId: 'group-1',
                releaseCount: 3,
            }),
        ).toEqual({ screen: 'ReleaseGroup', releaseGroupId: 'group-1' });
    });

    it('opens the release for a single-pressing group', () => {
        expect(
            resolveReleaseFeedNavigation({
                id: 'release-1',
                releaseGroupId: 'group-1',
                releaseCount: 1,
            }),
        ).toEqual({ screen: 'Release', releaseId: 'release-1' });
    });

    it('opens the release when a legacy entry has no group id', () => {
        expect(
            resolveReleaseFeedNavigation({
                id: 'release-1',
                releaseGroupId: null,
                releaseCount: 3,
            }),
        ).toEqual({ screen: 'Release', releaseId: 'release-1' });
    });
});
import type { NewRelease } from '@pawify/shared';

export type ReleaseFeedNavigationTarget =
    | { screen: 'ReleaseGroup'; releaseGroupId: string }
    | { screen: 'Release'; releaseId: string };

/**
 * A feed entry is a release group: one pressing opens the release, several open the
 * group screen. The public feed must keep `releaseGroupId` for this to work.
 */
export const resolveReleaseFeedNavigation = (
    release: Pick<NewRelease, 'id' | 'releaseGroupId' | 'releaseCount'>,
): ReleaseFeedNavigationTarget => {
    const releaseGroupId = release.releaseGroupId ?? null;
    if (releaseGroupId && (release.releaseCount ?? 1) > 1) {
        return { screen: 'ReleaseGroup', releaseGroupId };
    }
    return { screen: 'Release', releaseId: release.id };
};
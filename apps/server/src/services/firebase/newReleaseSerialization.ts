import type { NewRelease } from '@pawify/shared';
import type { StoredNewRelease, StoredNewReleasesMap } from './types.js';

/**
 * Public feed entries keep the group identity and content-event metadata.
 *
 * Clients use `releaseGroupId` + `releaseCount` to open the group screen for a
 * multi-pressing entry; removing the id here made that path unreachable and also
 * hid the group id from the internal prune comparison.
 */
export const toPublicNewRelease = (release: StoredNewRelease): NewRelease => ({
    ...release,
});

export const toPublicNewReleasesMap = (
    storedMap: StoredNewReleasesMap,
): { [releaseId: string]: NewRelease } =>
    Object.fromEntries(
        Object.entries(storedMap).map(([releaseId, release]) => [
            releaseId,
            toPublicNewRelease(release),
        ]),
    );

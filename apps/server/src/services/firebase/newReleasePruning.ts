import type { NewRelease } from '@pawify/shared';
import type { KnownReleaseGroupStateValue } from '../../features/releases/domain/releaseGroupProcessing.js';

type FeedEntry = Pick<NewRelease, 'id' | 'releaseGroupId'>;

/**
 * Release ids that should leave the feed after a group prune.
 *
 * Group entries carry `releaseGroupId`; pre-migration entries only carry a release
 * id, so the caller resolves those through the mirror first. Entries whose group
 * is still known under another artist are kept.
 */
export const collectPrunedNewReleaseIds = ({
    newReleasesMap,
    knownStatesByArtist,
    prunedGroupIds,
    releaseToGroupId,
}: {
    newReleasesMap: Record<string, FeedEntry>;
    knownStatesByArtist: Record<string, { [groupId: string]: KnownReleaseGroupStateValue }>;
    prunedGroupIds: readonly string[];
    releaseToGroupId: ReadonlyMap<string, string>;
}): string[] => {
    const pruned = new Set(prunedGroupIds);
    const stillKnown = (releaseId: string, groupId: string | null): boolean =>
        Object.values(knownStatesByArtist).some(
            (state) =>
                Object.prototype.hasOwnProperty.call(state, releaseId) ||
                (groupId !== null && Object.prototype.hasOwnProperty.call(state, groupId)),
        );

    const releaseIds: string[] = [];
    for (const [feedKey, entry] of Object.entries(newReleasesMap)) {
        const groupId = entry.releaseGroupId ?? releaseToGroupId.get(entry.id) ?? null;
        if (groupId === null || !pruned.has(groupId)) {
            continue;
        }
        if (!stillKnown(feedKey, groupId)) {
            releaseIds.push(feedKey);
        }
    }

    return releaseIds;
};
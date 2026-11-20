import type { KnownReleaseGroupStateValue } from '../../features/releases/domain/releaseGroupProcessing.js';

type FeedEntry = {
    id: string;
    releaseGroupId?: string | null;
};

/**
 * Release ids that should leave the feed after a group prune.
 *
 * Group entries carry `releaseGroupId`; canonical unresolved entries (null) are kept.
 * Entries whose group is still known under another artist are kept.
 */
export const collectPrunedNewReleaseIds = ({
    newReleasesMap,
    knownStatesByArtist,
    prunedGroupIds,
}: {
    newReleasesMap: Record<string, FeedEntry>;
    knownStatesByArtist: Record<string, { [groupId: string]: KnownReleaseGroupStateValue }>;
    prunedGroupIds: readonly string[];
}): string[] => {
    const pruned = new Set(prunedGroupIds);
    const stillKnown = (groupId: string | null): boolean =>
        groupId !== null &&
        Object.values(knownStatesByArtist).some((state) =>
            Object.prototype.hasOwnProperty.call(state, groupId),
        );

    const releaseIds: string[] = [];
    for (const [feedKey, entry] of Object.entries(newReleasesMap)) {
        const groupId = entry.releaseGroupId ?? null;
        if (groupId === null || !pruned.has(groupId)) {
            continue;
        }
        if (!stillKnown(groupId)) {
            releaseIds.push(feedKey);
        }
    }

    return releaseIds;
};

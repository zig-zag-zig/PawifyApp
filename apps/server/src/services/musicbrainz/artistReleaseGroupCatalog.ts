import type { ArtistCredit, Release } from '@pawify/shared';

import { getArtistReleaseGroupCandidatesFromMirror } from '../../infrastructure/musicDb/musicDbRepositories.js';
import { isMusicDbEnabled } from '../../infrastructure/musicDb/musicDbClient.js';
import type { ReleaseGroupCandidate } from '../../features/releases/domain/releaseGroupProcessing.js';
import { fetchAllReleasesForArtist } from './releaseQueries.js';
import { dateToTimestamp } from '../../utils/dateUtil.js';

export type ArtistReleaseGroupCatalog = {
    groups: ReleaseGroupCandidate[];
    /** Artist credits per group, for building the feed entry without another lookup. */
    creditsByGroupId: Map<string, ArtistCredit[]>;
};

/**
 * Collapses an artist's releases into release groups.
 *
 * This is the API-mode equivalent of the mirror's grouping query: pick the newest
 * release of each group as the representative, and keep every release id because a
 * user can open any pressing from the group screen.
 */
const groupReleases = (releases: Release[]): ArtistReleaseGroupCatalog => {
    const groups = new Map<string, ReleaseGroupCandidate>();
    const newestDateByGroup = new Map<string, string | null>();
    const creditsByGroupId = new Map<string, ArtistCredit[]>();

    for (const release of releases) {
        const groupId = release.releaseGroupId;
        if (!groupId) {
            continue;
        }

        const existing = groups.get(groupId);
        if (existing) {
            existing.releaseIds.push(release.id);
            if (
                dateToTimestamp(release.date) >
                dateToTimestamp(newestDateByGroup.get(groupId) ?? null)
            ) {
                existing.newestReleaseId = release.id;
                existing.newestReleaseDate = release.date;
                newestDateByGroup.set(groupId, release.date);
            }
            continue;
        }

        groups.set(groupId, {
            id: groupId,
            title: release['release-group']?.title ?? release.title,
            date: release['release-group']?.date ?? release.date,
            disambiguation: release['release-group']?.disambiguation ?? release.disambiguation,
            primaryType: release['release-group']?.['primary-type'] ?? null,
            releaseIds: [release.id],
            newestReleaseId: release.id,
            newestReleaseDate: release.date,
        });
        newestDateByGroup.set(groupId, release.date);
        creditsByGroupId.set(groupId, release['artist-credit'] ?? []);
    }

    return { groups: Array.from(groups.values()), creditsByGroupId };
};

const buildFromMirror = (artistId: string): ArtistReleaseGroupCatalog | null => {
    const groups = getArtistReleaseGroupCandidatesFromMirror(artistId);
    if (groups === null) {
        return null;
    }

    return {
        groups,
        // The mirror stores group credits; the caller only needs them for groups
        // that turn out to be new, so this stays empty and is filled on demand.
        creditsByGroupId: new Map(),
    };
};

const fetchFromApi = async (artistId: string): Promise<ArtistReleaseGroupCatalog> => {
    // No `inc=recordings` any more: the diff compares release groups, so tracklists
    // were only ever fetched to detect duplicate releases within a group, which the
    // grouping now does for free.
    const releases = await fetchAllReleasesForArtist(artistId, false);
    return groupReleases(releases);
};

/**
 * Release-group catalog used by the new-release scan.
 *
 * Read straight from the mirror: a full artist catalog is a handful of milliseconds,
 * so caching it in Redis only added serialization and staleness. The API fallback is
 * still cached by the API path itself when the mirror is unavailable.
 *
 * The notification runner scans every followed artist for every user, so the scan
 * passes one catalog per artist per run rather than re-reading it per user.
 */
export const getArtistReleaseGroupCatalog = async (
    artistId: string,
): Promise<ArtistReleaseGroupCatalog> => {
    const fromMirror = isMusicDbEnabled() ? buildFromMirror(artistId) : null;
    if (fromMirror !== null) {
        return fromMirror;
    }

    return await fetchFromApi(artistId);
};

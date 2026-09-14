import type { NewRelease } from '@pawify/shared';
import {
    NewReleasesMap,
    NewReleasesSnapshot,
    StoredNewRelease,
    StoredNewReleasesMap,
} from './types.js';
import { buildNewReleasesCollectionPayload, getNewReleasesMapDocRef } from './refs.js';
import { db } from '../../infrastructure/firebase/firebaseInit.js';
import { isPlainObject } from '../../common/utils/objectGuards.js';
import { monitorUserMapsDocSizes } from '../monitoring/mapsDocSizeMonitor.js';

const normalizePrimaryType = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;

/**
 * Upper bound on entries kept in the per-user `newReleases/maps` Firestore doc.
 * Each entry carries title, artist names, dates and disambiguation (~300 B
 * worst case), so ~1,000 entries stay far below the 1 MiB document limit while
 * remaining far beyond any feed a user would actually review. When the cap is
 * exceeded the oldest releases are dropped for good — the scan will not re-add
 * them because they remain in the user's known-release set, which is the
 * intended behavior for a feed this large.
 */
const MAX_STORED_NEW_RELEASES = 1000;

const capNewReleasesMap = (newReleasesMap: StoredNewReleasesMap): StoredNewReleasesMap => {
    const entries = Object.entries(newReleasesMap);
    if (entries.length <= MAX_STORED_NEW_RELEASES) {
        return newReleasesMap;
    }

    const sortedByNewest = entries.sort(([, left], [, right]) =>
        (right.date ?? '').localeCompare(left.date ?? ''),
    );

    return Object.fromEntries(sortedByNewest.slice(0, MAX_STORED_NEW_RELEASES));
};

const normalizeDateForDisplay = (value: unknown): string | null => {
    if (typeof value !== 'string' || !value.trim() || value === 'Unknown date') {
        return null;
    }

    const parts = value
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean);
    if (parts.length === 3) {
        const [day, month, year] = parts;
        return year && month && day
            ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            : null;
    }

    if (parts.length === 2) {
        const [month, year] = parts;
        return year && month ? `${year}-${month.padStart(2, '0')}` : null;
    }

    if (parts.length === 1) {
        return /^\d{4}$/.test(parts[0] ?? '') ? parts[0] : null;
    }

    return null;
};

const normalizeStoredDate = (date: unknown, dateForDisplay: unknown): string | null => {
    if (typeof date === 'string' && date.trim().length > 0) {
        return date.trim();
    }

    return normalizeDateForDisplay(dateForDisplay);
};

const normalizeArtistsMap = (value: unknown): { [artistId: string]: string } | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    const artists: { [artistId: string]: string } = {};
    for (const [artistId, artistName] of Object.entries(value)) {
        if (!artistId.trim() || typeof artistName !== 'string') {
            return null;
        }

        artists[artistId] = artistName;
    }

    return artists;
};

const normalizeNewRelease = (value: unknown): NewRelease | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    const artists = normalizeArtistsMap(value.artists);

    if (
        typeof value.id !== 'string' ||
        typeof value.title !== 'string' ||
        !artists ||
        typeof value.date_for_display !== 'string'
    ) {
        return null;
    }

    return {
        id: value.id,
        title: value.title,
        date: normalizeStoredDate(value.date, value.date_for_display),
        disambiguation: typeof value.disambiguation === 'string' ? value.disambiguation : null,
        artists,
        date_for_display: value.date_for_display,
        'primary-type': normalizePrimaryType(value['primary-type']),
    };
};

const normalizeStoredNewRelease = (value: unknown): StoredNewRelease | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    const release = normalizeNewRelease(value);
    if (!release) {
        return null;
    }

    const releaseGroupId =
        typeof value.releaseGroupId === 'string' && value.releaseGroupId.trim().length > 0
            ? value.releaseGroupId.trim()
            : null;

    return {
        ...release,
        releaseGroupId,
    };
};

const normalizeStoredNewReleasesMap = (value: unknown): StoredNewReleasesMap => {
    if (!isPlainObject(value)) {
        return {};
    }

    const map: StoredNewReleasesMap = {};

    for (const [releaseId, entry] of Object.entries(value)) {
        const normalizedRelease = normalizeStoredNewRelease(entry);
        if (!normalizedRelease || normalizedRelease.id !== releaseId) {
            continue;
        }

        map[releaseId] = normalizedRelease;
    }

    return map;
};

export const normalizeNewReleasesCollectionDocument = (
    value: unknown,
): StoredNewReleasesMap | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    return normalizeStoredNewReleasesMap(value);
};

const stripStoredNewRelease = (release: StoredNewRelease): NewRelease => {
    const { releaseGroupId: _releaseGroupId, ...publicRelease } = release;
    return publicRelease;
};

const stripStoredNewReleasesMap = (storedMap: StoredNewReleasesMap): NewReleasesMap =>
    Object.entries(storedMap).reduce<NewReleasesMap>((acc, [releaseId, release]) => {
        acc[releaseId] = stripStoredNewRelease(release);
        return acc;
    }, {});

export const writeNewReleasesState = async (
    userId: string,
    newReleasesMap: StoredNewReleasesMap,
): Promise<void> => {
    await getNewReleasesMapDocRef(userId).set(
        buildNewReleasesCollectionPayload(capNewReleasesMap(newReleasesMap)),
    );
};

export const mergeNewReleasesIntoState = async (
    userId: string,
    newReleases: StoredNewRelease[],
): Promise<void> => {
    const incomingMap = newReleases.reduce<StoredNewReleasesMap>((acc, release) => {
        const normalizedRelease = normalizeStoredNewRelease(release);
        if (normalizedRelease) {
            acc[normalizedRelease.id] = normalizedRelease;
        }

        return acc;
    }, {});

    if (Object.keys(incomingMap).length === 0) {
        return;
    }

    // Transactional read-modify-write so the doc stays under the entry cap:
    // a merge-only write could push the map past the Firestore 1 MiB limit and
    // get rejected, and concurrent per-artist merges during a scan would lose
    // updates under a plain read+set. This only runs when new releases were
    // actually found, so it is not on the hot path.
    const mapRef = getNewReleasesMapDocRef(userId);
    await db.runTransaction(async (transaction) => {
        const mapDoc = await transaction.get(mapRef);
        const existingMap = normalizeNewReleasesCollectionDocument(mapDoc.data()) ?? {};
        const mergedMap = capNewReleasesMap({ ...existingMap, ...incomingMap });
        transaction.set(mapRef, buildNewReleasesCollectionPayload(mergedMap));
    });
};

export const readNewReleasesState = async (userId: string): Promise<StoredNewReleasesMap> => {
    const mapDoc = await getNewReleasesMapDocRef(userId).get();
    const normalizedMapDoc = normalizeNewReleasesCollectionDocument(mapDoc.data());

    // Opportunistic monitoring of maps doc size
    monitorUserMapsDocSizes(userId).catch(() => {});

    if (normalizedMapDoc) {
        return normalizedMapDoc;
    }

    return {};
};

const buildNewReleaseCoverPageEntries = (newReleasesMap: StoredNewReleasesMap) => {
    const releaseIdsByGroup = new Map<
        string,
        { releaseGroupId: string; releaseIds: Set<string> }
    >();

    for (const release of Object.values(newReleasesMap)) {
        const releaseGroupId = release.releaseGroupId;
        if (!releaseGroupId) {
            continue;
        }

        const entry = releaseIdsByGroup.get(releaseGroupId) ?? {
            releaseGroupId,
            releaseIds: new Set<string>(),
        };
        entry.releaseIds.add(release.id);
        releaseIdsByGroup.set(releaseGroupId, entry);
    }

    return Array.from(releaseIdsByGroup.values()).map((entry) => ({
        releaseGroupId: entry.releaseGroupId,
        releaseIds: Array.from(entry.releaseIds),
    }));
};

export const getNewReleasesSnapshotFromDb = async (
    userId: string,
): Promise<NewReleasesSnapshot> => {
    const storedNewReleasesMap = await readNewReleasesState(userId);

    return {
        newReleasesMap: stripStoredNewReleasesMap(storedNewReleasesMap),
        coverPageEntries: buildNewReleaseCoverPageEntries(storedNewReleasesMap),
    };
};

type NewReleasesMapLike<T extends NewRelease> = {
    [releaseId: string]: T;
};

export const removeNewReleaseFromMap = <T extends NewRelease>(
    map: NewReleasesMapLike<T>,
    releaseId: string,
): NewReleasesMapLike<T> => {
    return removeNewReleasesFromMap(map, [releaseId]);
};

const removeNewReleasesFromMap = <T extends NewRelease>(
    map: NewReleasesMapLike<T>,
    releaseIds: string[],
): NewReleasesMapLike<T> => {
    const releaseIdSet = new Set(releaseIds);
    const updatedMap: NewReleasesMapLike<T> = {};

    for (const [releaseId, release] of Object.entries(map)) {
        if (!releaseIdSet.has(release.id)) {
            updatedMap[releaseId] = release;
        }
    }

    return updatedMap;
};

export const removeNewReleasesFromDb = async (
    userId: string,
    releaseIds: string[],
): Promise<void> => {
    const uniqueReleaseIds = Array.from(new Set(releaseIds.filter(Boolean)));
    if (uniqueReleaseIds.length === 0) {
        throw new Error('Invalid input: releaseIds are required.');
    }

    const state = await readNewReleasesState(userId);
    const updatedMap = removeNewReleasesFromMap(state, uniqueReleaseIds);

    await writeNewReleasesState(userId, updatedMap);
};

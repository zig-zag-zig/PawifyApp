import {
    computeReleaseGroupContentBaseline,
    type KnownReleaseGroupStateValue,
    type ReleaseGroupCandidate,
} from '../../features/releases/domain/releaseGroupProcessing.js';

export type ParsedKnownValue = {
    lastNotifiedDate: string | null;
    maxOfficialTrackCount: number | null;
    editionKeywords: string[];
    needsBaseline: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isValidArtistsMap = (value: unknown): value is Record<string, string> =>
    isObject(value) &&
    Object.entries(value).every(
        ([artistId, artistName]) => artistId.trim().length > 0 && typeof artistName === 'string',
    );

export const parseLegacyKnownValue = (value: unknown): ParsedKnownValue | null => {
    if (value === true) {
        return {
            lastNotifiedDate: '',
            maxOfficialTrackCount: null,
            editionKeywords: [],
            needsBaseline: true,
        };
    }
    if (typeof value === 'string') {
        return {
            lastNotifiedDate: value.trim(),
            maxOfficialTrackCount: null,
            editionKeywords: [],
            needsBaseline: true,
        };
    }
    if (!isObject(value)) return null;

    const date = typeof value.lastNotifiedDate === 'string' ? value.lastNotifiedDate.trim() : null;
    const hasCount =
        value.maxOfficialTrackCount === null || typeof value.maxOfficialTrackCount === 'number';
    const max =
        typeof value.maxOfficialTrackCount === 'number' &&
        Number.isFinite(value.maxOfficialTrackCount) &&
        value.maxOfficialTrackCount >= 0
            ? Math.floor(value.maxOfficialTrackCount)
            : null;
    const keywords = Array.isArray(value.editionKeywords)
        ? value.editionKeywords.filter(
              (keyword): keyword is string => typeof keyword === 'string' && keyword.length > 0,
          )
        : [];
    const complete =
        hasCount &&
        Array.isArray(value.editionKeywords) &&
        value.contentBaselined !== false &&
        (value.lastNotifiedDate === null || typeof value.lastNotifiedDate === 'string');

    return {
        lastNotifiedDate: date,
        maxOfficialTrackCount: max,
        editionKeywords: keywords,
        needsBaseline: !complete,
    };
};

export const parseLegacyDisplayDate = (value: string): string | null => {
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
    if (parts.length === 1) return /^\d{4}$/.test(parts[0] ?? '') ? parts[0]! : null;
    return null;
};

export type MigratedKnownArtistState = {
    state: Map<string, KnownReleaseGroupStateValue>;
    resolvedFromReleaseIds: number;
    unparsedKeys: string[];
};

/** Canonicalizes one artist's known state using the local catalogue baseline. */
export const migrateKnownArtistState = ({
    rawGroups,
    releaseToGroup,
    groupsById,
    catalogComplete,
}: {
    rawGroups: Record<string, unknown>;
    releaseToGroup: ReadonlyMap<string, string>;
    groupsById: ReadonlyMap<string, ReleaseGroupCandidate>;
    catalogComplete: boolean;
}): MigratedKnownArtistState => {
    const merged = new Map<string, KnownReleaseGroupStateValue>();
    const unparsedKeys: string[] = [];
    let resolvedFromReleaseIds = 0;

    for (const [storedKey, rawValue] of Object.entries(rawGroups)) {
        const parsed = parseLegacyKnownValue(rawValue);
        if (!parsed) {
            unparsedKeys.push(storedKey);
            continue;
        }

        const mapped = releaseToGroup.get(storedKey);
        const groupId = mapped ?? storedKey;
        if (mapped) resolvedFromReleaseIds += 1;

        const group = groupsById.get(groupId);
        const baseline =
            group && catalogComplete
                ? computeReleaseGroupContentBaseline(group)
                : {
                      maxOfficialTrackCount: parsed.maxOfficialTrackCount,
                      editionKeywords: parsed.editionKeywords,
                  };
        const needsBaseline = parsed.needsBaseline && !(group && catalogComplete);

        const previous = merged.get(groupId);
        const candidate: KnownReleaseGroupStateValue = {
            lastNotifiedDate:
                previous?.lastNotifiedDate &&
                parsed.lastNotifiedDate &&
                previous.lastNotifiedDate > parsed.lastNotifiedDate
                    ? previous.lastNotifiedDate
                    : (parsed.lastNotifiedDate ?? previous?.lastNotifiedDate ?? null),
            maxOfficialTrackCount:
                baseline.maxOfficialTrackCount ?? previous?.maxOfficialTrackCount ?? null,
            editionKeywords:
                baseline.editionKeywords.length > 0
                    ? baseline.editionKeywords
                    : (previous?.editionKeywords ?? []),
            ...(needsBaseline ? { contentBaselined: false } : {}),
        };
        merged.set(groupId, candidate);
    }

    return { state: merged, resolvedFromReleaseIds, unparsedKeys };
};

export type MigratedNewReleases = {
    map: Record<string, Record<string, unknown>>;
    unresolvedGroupIds: string[];
    invalidKeys: string[];
};

export const migrateNewReleasesMap = (
    raw: unknown,
    releaseToGroup: ReadonlyMap<string, string>,
): MigratedNewReleases => {
    if (!isObject(raw)) return { map: {}, unresolvedGroupIds: [], invalidKeys: [] };

    const unresolvedGroupIds: string[] = [];
    const invalidKeys: string[] = [];
    const entries: Array<{
        id: string;
        value: Record<string, unknown>;
        groupId: string | null;
        dateForDisplay: string;
    }> = [];

    for (const [key, value] of Object.entries(raw)) {
        if (
            !isObject(value) ||
            typeof value.id !== 'string' ||
            typeof value.title !== 'string' ||
            typeof value.date_for_display !== 'string' ||
            !isValidArtistsMap(value.artists)
        ) {
            invalidKeys.push(key);
            continue;
        }
        const groupId =
            typeof value.releaseGroupId === 'string' && value.releaseGroupId.trim().length > 0
                ? value.releaseGroupId.trim()
                : null;
        entries.push({
            id: value.id,
            value,
            groupId,
            dateForDisplay: value.date_for_display,
        });
    }

    const map: Record<string, Record<string, unknown>> = {};
    for (const entry of entries) {
        let groupId = entry.groupId;
        if (groupId === null) {
            groupId = releaseToGroup.get(entry.id) ?? null;
            if (groupId === null) unresolvedGroupIds.push(entry.id);
        }

        const date =
            typeof entry.value.date === 'string' && entry.value.date.trim().length > 0
                ? entry.value.date.trim()
                : parseLegacyDisplayDate(entry.dateForDisplay);
        map[entry.id] = { ...entry.value, id: entry.id, date, releaseGroupId: groupId };
    }

    return { map, unresolvedGroupIds, invalidKeys };
};

import type { ArtistReleaseGroup } from '../../../shared/music';
import type { ReleaseGroupSection } from '../model/types';

const RELEASE_TYPES_ORDER = [
    'Album',
    'Single',
    'EP',
    'Appearance',
    'Other',
    'Compilation',
    'Soundtrack',
    'Broadcast',
    'Spokenword',
    'Interview',
    'Audiobook',
    'Live',
    'Remix',
    'DJ-Mix',
    'Mixtape/Street'
] as const;

export const DEFAULT_RELEASE_ITEMS_TO_SHOW = 10;

export function buildInitialLoadedItemsByType(): Record<string, number> {
    return Object.fromEntries(
        RELEASE_TYPES_ORDER.map(type => [type, DEFAULT_RELEASE_ITEMS_TO_SHOW])
    );
}

export function buildReleaseSections(allReleaseGroups: ArtistReleaseGroup[]): ReleaseGroupSection[] {
    const groupedData = allReleaseGroups.reduce<Record<string, ArtistReleaseGroup[]>>((acc, releaseGroup) => {
        const releaseType = releaseGroup['primary-type'] ?? 'Other';

        if (!acc[releaseType]) {
            acc[releaseType] = [];
        }

        acc[releaseType].push(releaseGroup);
        return acc;
    }, {});

    return Object.entries(groupedData)
        .sort(([a], [b]) => {
            const aIndex = RELEASE_TYPES_ORDER.indexOf(a as (typeof RELEASE_TYPES_ORDER)[number]);
            const bIndex = RELEASE_TYPES_ORDER.indexOf(b as (typeof RELEASE_TYPES_ORDER)[number]);
            const normalizedAIndex = aIndex === -1 ? RELEASE_TYPES_ORDER.length : aIndex;
            const normalizedBIndex = bIndex === -1 ? RELEASE_TYPES_ORDER.length : bIndex;

            if (normalizedAIndex !== normalizedBIndex) {
                return normalizedAIndex - normalizedBIndex;
            }

            return a.localeCompare(b);
        })
        .map(([title, releaseGroups]) => ({
            title,
            releaseGroups,
        }));
}

import type { BackgroundAssetPlanner } from '../../src/services/backgroundAssets/plannerTypes.js';

/**
 * Baseline planner fake: everything stays pending with a deterministic task
 * id, no resolved values. Override individual methods for cached/mixed cases.
 */
export const createDefaultAssetPlanner = (
    overrides: Partial<BackgroundAssetPlanner> = {},
): BackgroundAssetPlanner => ({
    planArtistProfileImages: async ({ lookups, scope }) => ({
        taskId: lookups.length > 0 ? `task:${scope}` : null,
        resolved: {},
    }),
    planArtistReleaseGroupCovers: async ({ artistId }) => ({
        taskId: `task:rg:${artistId}`,
        resolved: {},
    }),
    planReleaseGroupReleaseCovers: async ({ releaseGroupId }) => ({
        taskId: `task:rg-releases:${releaseGroupId}`,
        resolved: {},
    }),
    planNewReleaseCovers: async () => ({
        taskId: 'task:new-release-covers',
        resolved: {},
    }),
    planReleaseTrackLyrics: async () => ({
        taskId: 'task:lyrics',
        resolved: {},
    }),
    planReleaseArtistProfileImages: async () => ({
        taskId: 'task:profile-images',
        resolved: {},
    }),
    ...overrides,
});

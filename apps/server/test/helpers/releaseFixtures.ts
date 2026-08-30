import type {
    NewRelease,
    Release,
    ReleaseNotificationSettings,
} from '../../src/modules/models/models.js';
import type { FollowedArtistSummary } from '../../src/utils/types/followedArtistTypes.js';
import type { ArtistProfileImageLookup } from '../../src/utils/types/taskTypes.js';

export const createReleaseNotificationSettings = (
    overrides: Partial<ReleaseNotificationSettings> = {},
): ReleaseNotificationSettings => ({
    oldestReleaseDateMonths: null,
    includeReleasesWithoutDate: false,
    ...overrides,
});

export const createNewRelease = (overrides: Partial<NewRelease> = {}): NewRelease => ({
    id: 'release-1',
    title: 'Release',
    date: '2026-01-01',
    disambiguation: null,
    artists: { 'artist-1': 'Artist' },
    date_for_display: '01.01.2026',
    'primary-type': 'Album',
    ...overrides,
});

export const createRelease = (overrides: Partial<Release> = {}): Release => ({
    id: 'release-1',
    title: 'Release',
    date: '2026-01-01',
    disambiguation: null,
    artistId: 'artist-1',
    date_for_display: '01.01.2026',
    'release-group': null,
    'artist-credit': [],
    media: [],
    releaseGroupId: null,
    cover_url: null,
    externalLinks: [],
    ...overrides,
});

export const createFollowedArtistSummary = (
    overrides: Partial<FollowedArtistSummary> = {},
): FollowedArtistSummary => ({
    id: 'artist-1',
    name: 'Artist One',
    refreshedAt: Date.now(),
    ...overrides,
});

export const createArtistProfileImageLookup = (
    overrides: Partial<ArtistProfileImageLookup> = {},
): ArtistProfileImageLookup => ({
    artistId: 'artist-1',
    artistName: 'Artist One',
    ...overrides,
});

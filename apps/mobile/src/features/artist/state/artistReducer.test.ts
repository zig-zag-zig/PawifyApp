import { describe, expect, it } from 'vitest';
import { artistReducer, createInitialArtistPageState } from './artistReducer';
import type { Artist, ArtistReleaseGroup } from '@pawify/shared';

function makeArtist(overrides: Partial<Artist> = {}): Artist {
  return {
    id: 'artist-1',
    name: 'Test Artist',
    type: 'Person',
    disambiguation: null,
    aliases: [],
    members: [],
    externalLinks: [],
    lifeSpan: { begin: null, end: null, ended: false },
    beginArea: { name: null },
    ...overrides,
  };
}

function makeReleaseGroup(id: string): ArtistReleaseGroup {
  return {
    id,
    title: `RG ${id}`,
    date: null,
    disambiguation: null,
    'primary-type': null,
    releaseIds: [],
  };
}

describe('artistReducer', () => {
  describe('initial state', () => {
    it('creates valid initial state', () => {
      const state = createInitialArtistPageState();
      expect(state.artist).toBeUndefined();
      expect(state.allReleaseGroups).toEqual([]);
      expect(state.isLoadingArtist).toBe(true);
      expect(state.isLoadingReleases).toBe(true);
      expect(state.isLoadingReleaseGroup).toBe(false);
      expect(state.isFollowLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.pendingTasks.artistTaskId).toBeNull();
      expect(state.pendingTasks.releasesTaskId).toBeNull();
    });
  });

  describe('artist load actions', () => {
    it('artistLoadStarted sets loading and clears error', () => {
      const state = artistReducer(
        { ...createInitialArtistPageState(), error: 'previous error' },
        { type: 'artistLoadStarted' },
      );
      expect(state.isLoadingArtist).toBe(true);
      expect(state.error).toBeNull();
    });

    it('artistLoadSucceeded stores artist and stops loading', () => {
      const artist = makeArtist();
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'artistLoadSucceeded',
        artist,
      });
      expect(state.artist).toBe(artist);
      expect(state.isLoadingArtist).toBe(false);
    });

    it('artistLoadFailed stops loading and stores error message', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'artistLoadFailed',
        message: 'Artist not found',
      });
      expect(state.isLoadingArtist).toBe(false);
      expect(state.error).toBe('Artist not found');
    });
  });

  describe('releases load actions', () => {
    it('releasesLoadStarted sets loading and clears error', () => {
      const state = artistReducer(
        { ...createInitialArtistPageState(), error: 'old error' },
        { type: 'releasesLoadStarted' },
      );
      expect(state.isLoadingReleases).toBe(true);
      expect(state.error).toBeNull();
    });

    it('releasesLoadSucceeded stores release groups and stops loading', () => {
      const groups = [makeReleaseGroup('rg-1'), makeReleaseGroup('rg-2')];
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'releasesLoadSucceeded',
        releaseGroups: groups,
      });
      expect(state.allReleaseGroups).toEqual(groups);
      expect(state.isLoadingReleases).toBe(false);
    });

    it('releasesLoadFailed stops loading and stores error', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'releasesLoadFailed',
        message: 'Failed to load',
      });
      expect(state.isLoadingReleases).toBe(false);
      expect(state.error).toBe('Failed to load');
    });
  });

  describe('follow actions', () => {
    it('followToggleStarted enables loading and clears error', () => {
      const state = artistReducer(
        { ...createInitialArtistPageState(), error: 'stale' },
        { type: 'followToggleStarted' },
      );
      expect(state.isFollowLoading).toBe(true);
      expect(state.error).toBeNull();
    });

    it('followToggleFinished disables loading', () => {
      const state = artistReducer(
        { ...createInitialArtistPageState(), isFollowLoading: true },
        { type: 'followToggleFinished' },
      );
      expect(state.isFollowLoading).toBe(false);
    });

    it('followToggleFailed disables loading and stores error', () => {
      const state = artistReducer(
        { ...createInitialArtistPageState(), isFollowLoading: true },
        { type: 'followToggleFailed', message: 'Network error' },
      );
      expect(state.isFollowLoading).toBe(false);
      expect(state.error).toBe('Network error');
    });
  });

  describe('release group load actions', () => {
    it('releaseGroupLoadStarted sets loading', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'releaseGroupLoadStarted',
      });
      expect(state.isLoadingReleaseGroup).toBe(true);
    });

    it('releaseGroupLoadFinished stops loading', () => {
      const state = artistReducer(
        { ...createInitialArtistPageState(), isLoadingReleaseGroup: true },
        { type: 'releaseGroupLoadFinished' },
      );
      expect(state.isLoadingReleaseGroup).toBe(false);
    });
  });

  describe('pending task actions', () => {
    it('pendingTaskUpdated sets artistTaskId', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'pendingTaskUpdated',
        key: 'artistTaskId',
        taskId: 'task-1',
      });
      expect(state.pendingTasks.artistTaskId).toBe('task-1');
      expect(state.pendingTasks.releasesTaskId).toBeNull();
    });

    it('pendingTaskUpdated sets releasesTaskId', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'pendingTaskUpdated',
        key: 'releasesTaskId',
        taskId: 'task-2',
      });
      expect(state.pendingTasks.releasesTaskId).toBe('task-2');
    });

    it('pendingTaskUpdated clears taskId when null', () => {
      const withTask = artistReducer(createInitialArtistPageState(), {
        type: 'pendingTaskUpdated',
        key: 'artistTaskId',
        taskId: 'task-1',
      });
      const cleared = artistReducer(withTask, {
        type: 'pendingTaskUpdated',
        key: 'artistTaskId',
        taskId: null,
      });
      expect(cleared.pendingTasks.artistTaskId).toBeNull();
    });
  });

  describe('member picture actions', () => {
    it('memberPictureQueued adds member to queue', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'memberPictureQueued',
        memberId: 'member-1',
      });
      expect(state.membersWithoutCachedPicture).toEqual(['member-1']);
    });

    it('memberPictureQueued is idempotent', () => {
      const withMember = artistReducer(createInitialArtistPageState(), {
        type: 'memberPictureQueued',
        memberId: 'member-1',
      });
      const duplicate = artistReducer(withMember, {
        type: 'memberPictureQueued',
        memberId: 'member-1',
      });
      expect(duplicate.membersWithoutCachedPicture).toEqual(['member-1']);
    });

    it('memberPictureResolved removes member from queue', () => {
      const withMembers = artistReducer(
        { ...createInitialArtistPageState(), membersWithoutCachedPicture: ['m1', 'm2'] },
        { type: 'memberPictureResolved', memberId: 'm1' },
      );
      expect(withMembers.membersWithoutCachedPicture).toEqual(['m2']);
    });
  });

  describe('image/cover queuing (existing tests)', () => {
    it('deduplicates queued image and cover work while preserving insertion order', () => {
      const initialState = createInitialArtistPageState();

      const withArtistImages = artistReducer(initialState, {
        type: 'artistImageLoadQueued',
        artistIds: ['artist-1', 'artist-2'],
      });
      const withMoreArtistImages = artistReducer(withArtistImages, {
        type: 'artistImageLoadQueued',
        artistIds: ['artist-2', 'artist-3'],
      });
      const withCovers = artistReducer(withMoreArtistImages, {
        type: 'releaseGroupCoverLoadQueued',
        releaseGroupIds: ['rg-1', 'rg-1', 'rg-2'],
      });

      expect(withMoreArtistImages.pendingArtistImageIds).toEqual([
        'artist-1',
        'artist-2',
        'artist-3',
      ]);
      expect(withCovers.pendingReleaseGroupCoverIds).toEqual(['rg-1', 'rg-2']);
    });

    it('removes only resolved pending work and keeps unrelated work queued', () => {
      const queuedState = {
        ...createInitialArtistPageState(),
        pendingArtistImageIds: ['artist-1', 'artist-2', 'artist-3'],
        pendingReleaseGroupCoverIds: ['rg-1', 'rg-2'],
      };

      const resolvedState = artistReducer(queuedState, {
        type: 'artistImageLoadFinished',
        artistIds: ['artist-2', 'missing'],
      });
      const coverResolvedState = artistReducer(resolvedState, {
        type: 'releaseGroupCoverLoadFinished',
        releaseGroupIds: ['rg-1'],
      });

      expect(resolvedState.pendingArtistImageIds).toEqual(['artist-1', 'artist-3']);
      expect(coverResolvedState.pendingReleaseGroupCoverIds).toEqual(['rg-2']);
    });
  });

  describe('releaseSectionLoadMore', () => {
    it('increments loaded count for a section', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'releaseSectionLoadMore',
        sectionTitle: 'Album',
      });
      expect(state.loadedItemsByType['Album']).toBe(20);
    });

    it('initializes unknown section to DEFAULT_RELEASE_ITEMS_TO_SHOW', () => {
      const state = artistReducer(createInitialArtistPageState(), {
        type: 'releaseSectionLoadMore',
        sectionTitle: 'UnknownType',
      });
      expect(state.loadedItemsByType['UnknownType']).toBe(20);
    });
  });

  describe('errorCleared', () => {
    it('clears error', () => {
      const state = artistReducer(
        { ...createInitialArtistPageState(), error: 'some error' },
        { type: 'errorCleared' },
      );
      expect(state.error).toBeNull();
    });
  });

  describe('resetForArtistChange', () => {
    it('resets to initial state', () => {
      const loadedState: ReturnType<typeof createInitialArtistPageState> = {
        ...createInitialArtistPageState(),
        artist: makeArtist(),
        isLoadingArtist: false,
        allReleaseGroups: [makeReleaseGroup('rg-1')],
      };
      const reset = artistReducer(loadedState, { type: 'resetForArtistChange' });
      expect(reset.artist).toBeUndefined();
      expect(reset.isLoadingArtist).toBe(true);
      expect(reset.allReleaseGroups).toEqual([]);
    });
  });

  describe('unknown action', () => {
    it('returns state unchanged for unknown action type', () => {
      const state = createInitialArtistPageState();
      const result = artistReducer(state, { type: 'nonexistent' } as any);
      expect(result).toBe(state);
    });
  });
});

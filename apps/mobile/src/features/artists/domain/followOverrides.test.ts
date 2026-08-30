import { describe, expect, it } from 'vitest';
import { applyFollowOverrides, type FollowingOverride } from './followOverrides';
import type { ArtistMinimal } from '@pawify/shared';

const artistA: ArtistMinimal = { id: 'a', name: 'A' };
const artistB: ArtistMinimal = { id: 'b', name: 'B' };

function override(id: string, isFollowing: boolean, version: number): FollowingOverride {
  return {
    artist: { id, name: id.toUpperCase() },
    isFollowing,
    version,
  };
}

describe('applyFollowOverrides', () => {
  it('returns the fetch result untouched when there are no overrides', () => {
    const { artists, remainingOverrides } = applyFollowOverrides(
      [artistA, artistB],
      new Map(),
      0,
    );
    expect(artists).toEqual([artistA, artistB]);
    expect(remainingOverrides.size).toBe(0);
  });

  it('keeps an unfollow override newer than the applied fetch version', () => {
    const { artists, remainingOverrides } = applyFollowOverrides(
      [artistA, artistB],
      new Map([['a', override('a', false, 2)]]),
      1,
    );
    expect(artists).toEqual([artistB]);
    expect(remainingOverrides.get('a')).toBeDefined();
  });

  it('drops an override at or below the applied fetch version (reflected)', () => {
    const { artists, remainingOverrides } = applyFollowOverrides(
      [artistB],
      new Map([['a', override('a', false, 1)]]),
      1,
    );
    expect(artists).toEqual([artistB]);
    expect(remainingOverrides.size).toBe(0);
  });

  it('adds a follow override newer than the fetch to the end of the list', () => {
    const { artists } = applyFollowOverrides(
      [artistA],
      new Map([['b', override('b', true, 2)]]),
      1,
    );
    expect(artists).toEqual([artistA, { id: 'b', name: 'B' }]);
  });

  it('updates an existing artist when a newer follow override replaces its data', () => {
    const { artists } = applyFollowOverrides(
      [artistA, artistB],
      new Map([['a', override('a', true, 2)]]),
      1,
    );
    expect(artists[0]).toEqual({ id: 'a', name: 'A' });
  });

  it('mixes kept and dropped overrides in one pass', () => {
    const { artists, remainingOverrides } = applyFollowOverrides(
      [artistA, artistB],
      new Map([
        ['a', override('a', false, 1)], // reflected -> dropped
        ['b', override('b', false, 3)], // newer -> kept and applied
      ]),
      2,
    );
    expect(artists).toEqual([artistA]);
    expect(remainingOverrides.has('b')).toBe(true);
    expect(remainingOverrides.has('a')).toBe(false);
  });
});

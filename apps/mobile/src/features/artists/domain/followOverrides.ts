import type { ArtistMinimal } from '@pawify/shared';

export type FollowingOverride = {
  artist: ArtistMinimal;
  isFollowing: boolean;
  /**
   * Monotonic version of the mutation that created this override. Fetches
   * capture the version counter when they start; an override newer than
   * that fetch must survive it (the response cannot reflect a mutation the
   * server had not seen yet).
   */
  version: number;
};

export type FollowOverridesResult = {
  artists: ArtistMinimal[];
  remainingOverrides: Map<string, FollowingOverride>;
};

/**
 * Applies optimistic follow/unfollow overrides to a fetch result.
 *
 * An override is applied only while it is NEWER than the fetch that produced
 * the result (`version > appliedVersion`). Overrides at or below the applied
 * version are considered reflected by that response and are dropped, so a
 * stale queued response can no longer resurrect an artist that was
 * optimistically removed after the request was sent.
 */
export function applyFollowOverrides(
  artists: ArtistMinimal[],
  overrides: ReadonlyMap<string, FollowingOverride>,
  appliedVersion: number,
): FollowOverridesResult {
  const remainingOverrides = new Map<string, FollowingOverride>();
  let nextArtists = artists;

  overrides.forEach((override, artistId) => {
    if (override.version <= appliedVersion) {
      return; // Reflected by this response; drop.
    }

    remainingOverrides.set(artistId, override);

    if (!override.isFollowing) {
      nextArtists = nextArtists.filter(artist => artist.id !== artistId);
      return;
    }

    const existingIndex = nextArtists.findIndex(artist => artist.id === artistId);
    if (existingIndex === -1) {
      nextArtists = [...nextArtists, override.artist];
      return;
    }

    nextArtists = nextArtists.map(artist =>
      artist.id === artistId ? override.artist : artist
    );
  });

  return { artists: nextArtists, remainingOverrides };
}

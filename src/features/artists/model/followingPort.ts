/**
 * Following Port
 *
 * Public contract for the following feature consumed by other features.
 * The primary surface is {@link useFollowing} from FollowingContext which returns a
 * {@link FollowingContextValue}. Other features access following state exclusively
 * through that hook; no direct mutation of internal state is permitted.
 *
 * Consumed by:
 *   - features/artist/hooks/useArtistPage.ts
 *   - features/artists/hooks/useArtistsPage.ts
 *
 * @module
 */

import type { ArtistMinimal } from '../../../shared/music';

/**
 * Public shape returned by `useFollowing()`.
 *
 * This type is defined in the controller layer
 * (features/artists/hooks/useFollowingController.ts) and re-exported here as the
 * canonical cross-feature contract.
 */
export type { FollowingContextValue } from '../hooks/useFollowingController';

/**
 * The following hook used by other features to read and write following state.
 *
 * Import via the FollowingContext barrel:
 * ```
 * import { useFollowing } from '../../artists/state/FollowingContext';
 * ```
 */
export type UseFollowingHook = () => {
  followingArtists: ArtistMinimal[];
  isLoadingFollowing: boolean;
  hasLoadedFollowingOnce: boolean;
  pendingArtistImageIds: string[];
  pendingEventUpdateRef: React.RefObject<boolean>;
  eventVersion: number;
  refreshFollowing: () => void;
  setFollowedArtist: (artist: ArtistMinimal, isFollowing: boolean) => void;
};

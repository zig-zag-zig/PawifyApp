import { mapCoverState } from '../../utils/helpers/remoteStateHelpers.js';
import type { CoverState } from '../../utils/types/cacheTypes.js';
import type { RemoteValueState } from '@pawify/shared';
import { assetKeys, readAssetState, writeAssetState } from '../cache/assetCache.js';

/**
 * Cover cache accessors.
 *
 * One key per release group and one per release, so resolving one artwork item never
 * rewrites a page-sized map. `ttl` is accepted for call-site compatibility but the
 * asset TTL policy decides the real lifetime: success and confirmed-miss entries get
 * different lifetimes, which a single caller-supplied number cannot express.
 */
export const readGroupCoverState = async (
    releaseGroupId: string,
): Promise<CoverState | null> => await readAssetState<CoverState>(assetKeys.groupCover(releaseGroupId));

export const writeGroupCoverState = async (
    releaseGroupId: string,
    state: CoverState,
    _ttl?: number | undefined,
): Promise<void> => await writeAssetState(assetKeys.groupCover(releaseGroupId), state);

export const readReleaseCoverState = async (
    releaseId: string,
): Promise<CoverState | null> => await readAssetState<CoverState>(assetKeys.releaseCover(releaseId));

export const writeReleaseCoverState = async (
    releaseId: string,
    state: CoverState,
    _ttl?: number | undefined,
): Promise<void> => await writeAssetState(assetKeys.releaseCover(releaseId), state);

export const toCoverState = (url: RemoteValueState): CoverState => mapCoverState(url);

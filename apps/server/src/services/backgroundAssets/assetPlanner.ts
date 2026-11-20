import { artistProfileImageTaskQueue } from '../../infrastructure/taskQueues/profileImageTaskQueue.js';
import { releaseTaskQueue } from '../../features/releases/infrastructure/releaseTaskQueue.js';
import { cacheAssetPartitioner } from '../cache/partitionCachedAssets.js';
import { createCacheFirstAssetPlanner } from './cacheFirstAssetPlanner.js';

/**
 * The single planner used by the v3 composition root.
 *
 * There is no legacy planner or contract-namespace selection: the supported
 * runtime has one cache-first implementation.
 */
export const cacheFirstAssetPlanner = createCacheFirstAssetPlanner({
    artistProfileImageQueue: artistProfileImageTaskQueue,
    releaseTaskQueue,
    cacheAssetPartitioner,
});

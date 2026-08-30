import { artistProfileImageTaskQueue } from '../infrastructure/taskQueues/profileImageTaskQueue.js';
import { releaseTaskQueue } from '../features/releases/infrastructure/releaseTaskQueue.js';
import { cacheAssetPartitioner } from '../services/cache/partitionCachedAssets.js';
import { createLegacyAssetPlanner } from '../services/backgroundAssets/legacyAssetPlanner.js';
import { createCacheFirstAssetPlanner } from '../services/backgroundAssets/cacheFirstAssetPlanner.js';

const queuePorts = {
    artistProfileImageQueue: artistProfileImageTaskQueue,
    releaseTaskQueue,
};

/** v1: queue full sets, always return a task id, no immediate maps. */
export const legacyAssetPlanner = createLegacyAssetPlanner(queuePorts);

/** v2: pre-resolve from cache, queue pending only, null task when done. */
export const cacheFirstAssetPlanner = createCacheFirstAssetPlanner({
    ...queuePorts,
    cacheAssetPartitioner,
});

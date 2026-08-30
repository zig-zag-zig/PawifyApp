import { requestDeduper } from '../../../common/request/requestDeduper.js';
import { musicBrainzReleaseCatalog } from './musicBrainzReleaseCatalog.js';
import {
    missingReleaseCleanupRepository,
    newReleasesRepository,
    releaseNotifier,
} from './releaseInfrastructureAdapters.js';
import { releaseTaskQueue } from './releaseTaskQueue.js';
import type { ReleaseUseCaseDependencies } from '../ports.js';

export const releaseDependencies: Omit<ReleaseUseCaseDependencies, 'assetPlanner'> = {
    missingReleaseCleanupRepository,
    newReleasesRepository,
    releaseCatalogGateway: musicBrainzReleaseCatalog,
    releaseNotifier,
    releaseTaskQueue,
    requestDeduper,
};

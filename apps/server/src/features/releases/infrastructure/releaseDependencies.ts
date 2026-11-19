import { requestDeduper } from '../../../common/request/requestDeduper.js';
import { sqliteReleaseCatalog } from './sqliteReleaseCatalog.js';
import {
    newReleasesRepository,
    releaseNotifier,
} from './releaseInfrastructureAdapters.js';
import { releaseTaskQueue } from './releaseTaskQueue.js';
import type { ReleaseUseCaseDependencies } from '../ports.js';

export const releaseDependencies: Omit<ReleaseUseCaseDependencies, 'assetPlanner'> = {
    newReleasesRepository,
    releaseCatalogGateway: sqliteReleaseCatalog,
    releaseNotifier,
    releaseTaskQueue,
    requestDeduper,
};

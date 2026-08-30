import { createApiRoutes } from './apiRoutes.js';
import {
    artistPresentersV2,
    artistUseCasesV2,
    releasePresentersV2,
    releaseUseCasesV2,
} from './useCaseVariants.js';

export const API_V2_PREFIX = '/v2';

export const v2Routes = createApiRoutes(API_V2_PREFIX, {
    artistUseCases: artistUseCasesV2,
    artistPresenters: artistPresentersV2,
    releaseUseCases: releaseUseCasesV2,
    releasePresenters: releasePresentersV2,
});

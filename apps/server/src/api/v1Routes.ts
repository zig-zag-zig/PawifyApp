import { createApiRoutes } from './apiRoutes.js';
import {
    artistPresentersV1,
    artistUseCasesV1,
    releasePresentersV1,
    releaseUseCasesV1,
} from './useCaseVariants.js';

export const API_V1_PREFIX = '/v1';

export const v1Routes = createApiRoutes(API_V1_PREFIX, {
    artistUseCases: artistUseCasesV1,
    artistPresenters: artistPresentersV1,
    releaseUseCases: releaseUseCasesV1,
    releasePresenters: releasePresentersV1,
});

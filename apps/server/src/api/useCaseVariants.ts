import { createArtistUseCases } from '../features/artists/artistUseCases.js';
import { createReleaseUseCases } from '../features/releases/releaseUseCases.js';
import {
    artistPresentersV1,
    artistPresentersV2,
} from '../features/artists/handlers/artistHandlers.js';
import {
    releasePresentersV1,
    releasePresentersV2,
} from '../features/releases/handlers/releaseHandlers.js';
import { cacheFirstAssetPlanner, legacyAssetPlanner } from './assetPlanners.js';

export const artistUseCasesV1 = createArtistUseCases(legacyAssetPlanner);
export const artistUseCasesV2 = createArtistUseCases(cacheFirstAssetPlanner);
export const releaseUseCasesV1 = createReleaseUseCases(legacyAssetPlanner);
export const releaseUseCasesV2 = createReleaseUseCases(cacheFirstAssetPlanner);

export { artistPresentersV1, artistPresentersV2 };
export { releasePresentersV1, releasePresentersV2 };

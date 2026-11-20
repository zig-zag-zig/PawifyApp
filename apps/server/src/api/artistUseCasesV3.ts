import { createArtistUseCases } from '../features/artists/artistUseCases.js';
import { cacheFirstAssetPlanner } from '../services/backgroundAssets/assetPlanner.js';

export const artistUseCasesV3 = createArtistUseCases(cacheFirstAssetPlanner);

export { artistPresentersV3 } from '../features/artists/handlers/artistHandlers.js';

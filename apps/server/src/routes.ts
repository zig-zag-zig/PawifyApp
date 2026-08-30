import type { Express } from 'express';
import { v1Routes } from './api/v1Routes.js';
import { v2Routes } from './api/v2Routes.js';
import { createApiRoutes } from './api/apiRoutes.js';
import {
    artistPresentersV1,
    artistUseCasesV1,
    releasePresentersV1,
    releaseUseCasesV1,
} from './api/useCaseVariants.js';

export const registerRoutes = (app: Express): void => {
    app.use(v1Routes);
    app.use(v2Routes);

    // Unversioned compatibility alias: duplicates the v1 API for ancient client
    // builds that predate versioned paths. PawifyApp always sends a vN prefix
    // (derived from its app major), so this serves only old builds — it can be
    // removed once those have aged out.
    app.use(
        createApiRoutes('', {
            artistUseCases: artistUseCasesV1,
            artistPresenters: artistPresentersV1,
            releaseUseCases: releaseUseCasesV1,
            releasePresenters: releasePresentersV1,
        }),
    );
};

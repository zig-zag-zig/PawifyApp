import express from 'express';
import { createReleaseHandlers, type ReleaseWirePresenters } from './handlers/releaseHandlers.js';
import type { ReleaseUseCases } from './releaseUseCases.js';

export const createReleaseRoutes = (
    releaseUseCases: ReleaseUseCases,
    presenters: ReleaseWirePresenters,
): express.Router => {
    const router = express.Router();
    const handlers = createReleaseHandlers(releaseUseCases, presenters);

    router.get('/getNewReleases', handlers.getNewReleasesHandler);
    router.post('/removeNewReleases', handlers.removeNewReleasesHandler);
    router.post('/getArtistReleases', handlers.getArtistReleasesHandler);
    router.post('/getReleaseGroupReleases', handlers.getReleaseGroupReleasesHandler);
    router.post('/getRelease', handlers.getReleaseHandler);
    router.post('/verifyReleaseExistence', handlers.verifyReleaseExistenceHandler);

    return router;
};

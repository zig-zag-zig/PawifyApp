import express, { type Router } from 'express';
import { healthRoutes } from '../features/health/healthRoutes.js';
import { authRoutes } from '../features/auth/authRoutes.js';
import { pushTokenRoutes } from '../features/pushTokens/pushTokenRoutes.js';
import { createArtistRoutes } from '../features/artists/artistRoutes.js';
import { createReleaseRoutes } from '../features/releases/releaseRoutes.js';
import { userSettingsRoutes } from '../features/userSettings/userSettingsRoutes.js';
import { notificationRoutes } from '../features/notifications/notificationRoutes.js';
import { taskRoutes } from '../features/tasks/taskRoutes.js';
import { artworkRoutes } from '../features/artwork/artworkRoutes.js';
import { artistPresentersV3 } from '../features/artists/handlers/artistHandlers.js';
import { releasePresentersV3 } from '../features/releases/handlers/releaseHandlers.js';
import { artistUseCasesV3 } from './artistUseCasesV3.js';
import { releaseUseCasesV3 } from './releaseUseCasesV3.js';

/**
 * The one supported API contract.
 *
 * Every route family (auth, following, settings, notifications, catalogue tasks,
 * artwork) is mounted under the same version: migrating only release routes would
 * strand login or push handling.
 */
export const createApiRoutes = (prefix: string): Router => {
    const router = express.Router();

    router.use(prefix, healthRoutes);
    router.use(prefix, authRoutes);
    router.use(prefix, pushTokenRoutes);
    router.use(prefix, createArtistRoutes(artistUseCasesV3, artistPresentersV3));
    router.use(prefix, createReleaseRoutes(releaseUseCasesV3, releasePresentersV3));
    router.use(prefix, userSettingsRoutes);
    router.use(prefix, notificationRoutes);
    router.use(prefix, taskRoutes);
    router.use(prefix, artworkRoutes);

    return router;
};

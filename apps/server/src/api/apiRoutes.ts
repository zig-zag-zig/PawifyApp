import express, { type Router } from 'express';
import { healthRoutes } from '../features/health/healthRoutes.js';
import { authRoutes } from '../features/auth/authRoutes.js';
import { pushTokenRoutes } from '../features/pushTokens/pushTokenRoutes.js';
import { createArtistRoutes } from '../features/artists/artistRoutes.js';
import { createReleaseRoutes } from '../features/releases/releaseRoutes.js';
import { userSettingsRoutes } from '../features/userSettings/userSettingsRoutes.js';
import { notificationRoutes } from '../features/notifications/notificationRoutes.js';
import { taskRoutes } from '../features/tasks/taskRoutes.js';
import type { ArtistUseCases } from '../features/artists/artistUseCases.js';
import type { ArtistWirePresenters } from '../features/artists/handlers/artistHandlers.js';
import type { ReleaseUseCases } from '../features/releases/releaseUseCases.js';
import type { ReleaseWirePresenters } from '../features/releases/handlers/releaseHandlers.js';

export type ApiRouteVariants = {
    artistUseCases: ArtistUseCases;
    artistPresenters: ArtistWirePresenters;
    releaseUseCases: ReleaseUseCases;
    releasePresenters: ReleaseWirePresenters;
};

export const createApiRoutes = (prefix: string, variants: ApiRouteVariants): Router => {
    const router = express.Router();
    const { artistUseCases, artistPresenters, releaseUseCases, releasePresenters } = variants;

    router.use(prefix, healthRoutes);
    router.use(prefix, authRoutes);
    router.use(prefix, pushTokenRoutes);
    router.use(prefix, createArtistRoutes(artistUseCases, artistPresenters));
    router.use(prefix, createReleaseRoutes(releaseUseCases, releasePresenters));
    router.use(prefix, userSettingsRoutes);
    router.use(prefix, notificationRoutes);
    router.use(prefix, taskRoutes);

    return router;
};

import type { Express } from 'express';
import { healthRoutes } from './features/health/healthRoutes.js';
import { createApiRoutes } from './api/apiRoutes.js';
import { v3Routes } from './api/v3Routes.js';

export const registerRoutes = (app: Express): void => {
    // Liveness/readiness stays unversioned for orchestration probes.
    app.use(healthRoutes);

    app.use(createApiRoutes('/v1'));
    app.use(createApiRoutes('/v2'));
    app.use(v3Routes);
};

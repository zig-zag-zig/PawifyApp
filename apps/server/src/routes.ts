import type { Express } from 'express';
import { healthRoutes } from './features/health/healthRoutes.js';
import { rejectUnsupportedApiVersions } from './api/legacyVersionRejection.js';
import { v3Routes } from './api/v3Routes.js';

export const registerRoutes = (app: Express): void => {
    // Liveness/readiness stays unversioned for orchestration probes.
    app.use(healthRoutes);

    app.use(rejectUnsupportedApiVersions());
    app.use(v3Routes);
};

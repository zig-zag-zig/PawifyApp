import express from 'express';
import { errorMiddleware } from './common/http/errorMiddleware.js';
import { serverConfig } from './config/runtimeConfig.js';
import { setupExpressErrorMonitoring } from './infrastructure/monitoring/sentry.js';
import { registerRoutes } from './routes.js';

export const createApp = (): express.Express => {
    const app = express();

    app.set('etag', false);
    app.use(express.json({ limit: serverConfig.requestBodyLimit }));
    app.use(express.urlencoded({ limit: serverConfig.requestBodyLimit, extended: true }));

    registerRoutes(app);
    setupExpressErrorMonitoring(app);
    app.use(errorMiddleware);

    return app;
};

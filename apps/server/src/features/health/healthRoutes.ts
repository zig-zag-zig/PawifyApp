import express from 'express';
import { publicHandler } from '../../common/http/handlers.js';
import { isMusicDbReady } from '../../infrastructure/musicDb/musicDbClient.js';

export const healthRoutes = express.Router();

/** Liveness: the process is up. Does not imply catalogue readiness. */
healthRoutes.get(
    '/health',
    publicHandler('/health', (_req, res) => {
        res.status(200).send('Server is healthy.');
    }),
);

/** Readiness: the required catalogue mirror can answer. */
healthRoutes.get(
    '/ready',
    publicHandler('/ready', (_req, res) => {
        if (!isMusicDbReady()) {
            res.status(503).json({
                status: 'not-ready',
                reason: 'Music catalogue database is unavailable',
            });
            return;
        }
        res.status(200).json({ status: 'ready' });
    }),
);

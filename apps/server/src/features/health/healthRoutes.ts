import express from 'express';
import { publicHandler } from '../../common/http/handlers.js';

export const healthRoutes = express.Router();

healthRoutes.get(
    '/health',
    publicHandler('/health', (_req, res) => {
        res.status(200).send('Server is healthy.');
    }),
);

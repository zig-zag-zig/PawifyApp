import express from 'express';
import { notifyNewReleasesHandler } from './notificationHandlers.js';

export const notificationRoutes = express.Router();

notificationRoutes.get('/notifyNewReleases', notifyNewReleasesHandler);

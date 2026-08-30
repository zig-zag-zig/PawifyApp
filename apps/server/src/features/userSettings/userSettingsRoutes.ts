import express from 'express';
import {
    getReleaseNotificationSettingsHandler,
    updateReleaseNotificationSettingsHandler,
} from './userSettingsHandlers.js';

export const userSettingsRoutes = express.Router();

userSettingsRoutes.get('/getReleaseNotificationSettings', getReleaseNotificationSettingsHandler);
userSettingsRoutes.post(
    '/updateReleaseNotificationSettings',
    updateReleaseNotificationSettingsHandler,
);

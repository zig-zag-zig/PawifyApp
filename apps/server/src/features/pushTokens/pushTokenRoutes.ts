import express from 'express';
import { deletePushTokenHandler, savePushTokenHandler } from './pushTokenHandlers.js';

export const pushTokenRoutes = express.Router();

pushTokenRoutes.post('/savePushToken', savePushTokenHandler);
pushTokenRoutes.post('/deletePushToken', deletePushTokenHandler);

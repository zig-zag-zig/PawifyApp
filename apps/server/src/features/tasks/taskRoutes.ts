import express from 'express';
import { getTaskResultHandler } from './taskHandlers.js';

export const taskRoutes = express.Router();

taskRoutes.post('/getTaskResult', getTaskResultHandler);

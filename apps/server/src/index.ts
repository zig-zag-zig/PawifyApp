import './env.js';
import './infrastructure/monitoring/sentry.js';
import { createApp } from './app.js';
import { startServer } from './server.js';

startServer(createApp());

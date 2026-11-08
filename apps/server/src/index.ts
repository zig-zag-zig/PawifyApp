import './env.js';
import './infrastructure/monitoring/sentry.js';
import { createApp } from './app.js';
import { startServer } from './server.js';
import { initializeMusicDb } from './infrastructure/musicDb/musicDbClient.js';

// Open the local MusicBrainz mirror before accepting traffic. A mirror that cannot
// be opened is fatal here on purpose: failing at boot is diagnosable, whereas
// serving from a broken mirror turns into per-request errors or a silent fallback
// to the API that hides a broken sync job.
initializeMusicDb();

// Artwork now lives in `entity_images`; any leftover `asset:*` artwork key is
// deleted on touch by `assetCache`, so no boot-time sweep is needed.

startServer(createApp());

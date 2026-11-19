import './env.js';
import './infrastructure/monitoring/sentry.js';
import { createApp } from './app.js';
import { startServer } from './server.js';
import { initializeMusicDb } from './infrastructure/musicDb/musicDbClient.js';
import { initializeLyricsDb } from './infrastructure/lyricsDb/lyricsDbClient.js';

// Open the required local MusicBrainz mirror and the application-owned lyrics
// state before accepting traffic. Both are fatal at boot on purpose: a broken
// catalogue would otherwise become per-request 503s, and a missing lyrics store
// would silently stop persisting enrichment. Neither is a feature toggle.
initializeMusicDb();

if (!initializeLyricsDb()) {
    throw new Error(
        'Persistent lyrics database is required at startup. Create it with `npm run lyrics:db:migrate -- --apply` and set LYRICS_DB_PATH.',
    );
}

// Artwork lives in `entity_images`; lyrics state lives in the separate
// application-owned SQLite database. No catalogue payload is mirrored into Redis.

startServer(createApp());

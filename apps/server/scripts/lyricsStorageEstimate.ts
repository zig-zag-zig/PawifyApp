/**
 * Measures sparse lyrics-store growth on a throwaway database.
 *
 *   npx tsx scripts/lyricsStorageEstimate.ts [--rows 10000]
 *
 * No production path is touched. The estimate includes the primary-key index,
 * provider state timestamps and a representative resolved URL/key; WAL headroom
 * must be added separately (checkpointed SQLite keeps WAL bounded).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    createLyricsDatabase,
    openLyricsDb,
} from '../src/infrastructure/lyricsDb/lyricsDbClient.js';

const rowsIndex = process.argv.indexOf('--rows');
const rows = Math.max(
    1000,
    Number.parseInt(rowsIndex >= 0 ? (process.argv[rowsIndex + 1] ?? '') : '', 10) || 10_000,
);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pawify-lyrics-estimate-'));
const databasePath = path.join(directory, 'lyrics.db');

const main = (): void => {
    createLyricsDatabase(databasePath);
    const db = openLyricsDb(databasePath);
    const now = Date.now();
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    const insert = db.prepare(
        `INSERT INTO lyrics_lookup_state (
             lookup_key, recording_mbid, query_fingerprint, resolved_url, provider,
             outcome, checked_at, next_attempt_at, genius_attempted_at,
             musicbrainz_attempted_at
         ) VALUES (?, ?, ?, ?, ?, 'found', ?, ?, ?, ?)`,
    );
    db.transaction(() => {
        for (let index = 0; index < rows; index += 1) {
            const mbid = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
            const fingerprint = `f${String(index).padStart(31, '0')}`;
            insert.run(
                `recording:${mbid}:${fingerprint}`,
                mbid,
                fingerprint,
                `https://genius.com/artist-${index % 500}-song-${index}-lyrics`,
                index % 5 === 0 ? 'musicbrainz' : 'genius',
                now,
                now + 90 * 24 * 60 * 60 * 1000,
                now,
                now,
            );
        }
    })();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    const bytes = fs.statSync(databasePath).size;
    const perRow = bytes / rows;
    console.log(
        JSON.stringify(
            {
                rows,
                databaseBytes: bytes,
                bytesPerRow: Math.round(perRow * 100) / 100,
                projected100kBytes: Math.round(perRow * 100_000),
                projected1mBytes: Math.round(perRow * 1_000_000),
                note: 'URL/key/state storage only; add WAL checkpoint headroom and filesystem slack.',
            },
            null,
            2,
        ),
    );
};

try {
    main();
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}

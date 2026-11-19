import { getMusicDb, musicDbHasRecordingIndex } from './musicDbClient.js';

/**
 * Track data is only served when the mirror actually carries it. A migrated-but-
 * unindexed or not-yet-merged mirror must fall back to the MusicBrainz API
 * instead of returning empty tracklists as if they were the real data.
 */
const trackContract = (db: ReturnType<typeof getMusicDb>): string[] => [
    'media',
    'tracks',
    'track_artists',
    'recording_lyrics',
];

/**
 * Edition metadata (status, country, formats, track counts) is only trusted once
 * the mirror's media data has been merged. A partially imported mirror can have
 * artists and releases while `media` is still empty; treating that as a content
 * baseline would silently swallow every future deluxe edition.
 */
export const canServeEditionMetadata = (): boolean => {
    const db = getMusicDb();
    if (!db) return false;

    const mediaColumns = db.prepare('PRAGMA table_info(media)').all() as { name: string }[];
    const names = new Set(mediaColumns.map((column) => column.name));
    if (!names.has('format') || !names.has('track_count')) return false;

    const meta = db.prepare(`SELECT value FROM _meta WHERE key='track_data_state'`).get() as
        | { value: string }
        | undefined;
    return meta?.value === 'ready';
};

export const mirrorHasTrackData = (releaseId: string): boolean => {
    const db = getMusicDb();
    if (!db) return false;
    if (!musicDbHasRecordingIndex()) return false;
    const row = db
        .prepare(
            `SELECT count(*) n FROM sqlite_master WHERE name IN ('media','tracks','track_artists','recording_lyrics','recording_artists','recordings')`,
        )
        .get() as { n: number };
    if (row.n < 6) return false;
    const meta = db.prepare(`SELECT value FROM _meta WHERE key='track_data_state'`).get() as
        { value: string } | undefined;
    if (meta?.value !== 'ready') return false;
    return (
        db
            .prepare(
                `SELECT 1 FROM media m JOIN releases r ON r.id=m.release_id WHERE r.mbid=? LIMIT 1`,
            )
            .get(releaseId) !== undefined
    );
};

export const canServeTrackData = (): boolean => {
    const db = getMusicDb();
    if (!db) return false;
    for (const table of trackContract(db)) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        if (columns.length === 0) return false;
    }
    const meta = db.prepare(`SELECT value FROM _meta WHERE key='track_data_state'`).get() as
        { value: string } | undefined;
    return meta?.value === 'ready';
};

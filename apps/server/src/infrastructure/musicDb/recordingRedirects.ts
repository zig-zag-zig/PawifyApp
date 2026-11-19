import type { MusicDb } from './musicDbClient.js';
import { getMusicDb } from './musicDbClient.js';

type RedirectShape =
    | { table: 'mbid_redirects'; columns: Set<string> }
    | { table: 'recording_redirects'; columns: Set<string> }
    | null;

/**
 * Optional mirror redirect data.
 *
 * The current mirror build does not ship a redirect table, so this is detected at
 * runtime and treated as absent when missing. If a future build adds either common
 * shape, lyric lookups follow the canonical recording id while leaving the old
 * durable row in place rather than deleting history.
 */
let detected: { db: MusicDb; shape: RedirectShape } | null = null;

const readColumns = (db: MusicDb, table: string): Set<string> => {
    try {
        const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
        return new Set(rows.map((row) => row.name));
    } catch {
        return new Set();
    }
};

const detect = (db: MusicDb): RedirectShape => {
    if (detected?.db === db) return detected.shape;

    let shape: RedirectShape = null;
    for (const table of ['mbid_redirects', 'recording_redirects'] as const) {
        const columns = readColumns(db, table);
        if (columns.size === 0) continue;
        if (
            table === 'mbid_redirects' &&
            ['entity_type', 'old_mbid', 'new_mbid'].every((column) => columns.has(column))
        ) {
            shape = { table, columns };
            break;
        }
        if (
            table === 'recording_redirects' &&
            ['old_mbid', 'new_mbid'].every((column) => columns.has(column))
        ) {
            shape = { table, columns };
            break;
        }
    }

    detected = { db, shape };
    return shape;
};

export const resolveRecordingRedirectMbid = (recordingMbid: string): string => {
    const trimmed = recordingMbid.trim();
    if (!trimmed) return trimmed;

    try {
        const db = getMusicDb();
        const shape = detect(db);
        if (!shape) return trimmed;

        const statement =
            shape.table === 'mbid_redirects'
                ? db.prepare(
                      `SELECT new_mbid FROM mbid_redirects WHERE entity_type = 'recording' AND old_mbid = ?`,
                  )
                : db.prepare(`SELECT new_mbid FROM recording_redirects WHERE old_mbid = ?`);

        let current = trimmed;
        for (let hop = 0; hop < 3; hop += 1) {
            const row = statement.get(current) as { new_mbid: string } | undefined;
            const next = row?.new_mbid?.trim();
            if (!next || next === current) break;
            current = next;
        }
        return current;
    } catch {
        // No mirror (or an unexpected redirect schema): keep the durable original
        // identity. A missed redirect must never discard stored state.
        return trimmed;
    }
};

/** Test-only: forget the detected redirect-table shape. */
export const resetRecordingRedirectDetectionForTests = (): void => {
    detected = null;
};

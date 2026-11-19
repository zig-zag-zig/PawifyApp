import type { ArtistCredit } from '@pawify/shared';
import type { MusicDb } from './musicDbClient.js';
import type { RecordingSearchResult } from '../../services/musicbrainz/recordingSearch.js';

const MAX_MATCHES = 10_000;
const CANDIDATES = 1200;
const tokensOf = (s: string): string[] =>
    s
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, 16);
const normalize = (s: string): string => tokensOf(s).join(' ');
const quote = (s: string): string => `"${s.replace(/"/g, '""')}"`;

export function readRecordingSearch(
    db: MusicDb,
    query: string,
    offset: number,
    limit: number,
): RecordingSearchResult {
    if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
    )
        throw new Error('Invalid recording search page');
    const tokens = tokensOf(query);
    if (!tokens.length) return { recordings: [], count: 0 };
    const phrase = quote(tokens.join(' '));
    const or = tokens.map(quote).join(' OR ');
    const and = tokens.map(quote).join(' AND ');
    const lastPrefix = tokens
        .map((t, i) => quote(t) + (i === tokens.length - 1 && t.length >= 3 ? '*' : ''))
        .join(' AND ');
    const probes = [...new Set([`recording:${phrase}`, `recording:(${and})`, and, lastPrefix, or])];
    const count = db.prepare(
        'SELECT count(*) n FROM (SELECT rowid FROM search_fts_recording WHERE search_fts_recording MATCH ? LIMIT ?)',
    );
    const candidates = new Map<number, { id: number; score: number }>();
    let total = 0;
    for (const match of probes) {
        const n = (count.get(match, MAX_MATCHES + 1) as { n: number }).n;
        total = Math.max(total, n);
        const broad = n > MAX_MATCHES;
        const rows = db
            .prepare(
                `SELECT rowid id, ${broad ? '0' : 'bm25(search_fts_recording,2,2.2,1,1.75,1,1,1,0.5)'} score
            FROM search_fts_recording WHERE search_fts_recording MATCH ? ${broad ? '' : 'ORDER BY score,rowid'} LIMIT ?`,
            )
            .all(match, CANDIDATES) as { id: number; score: number }[];
        for (const row of rows) if (!candidates.has(row.id)) candidates.set(row.id, row);
    }
    const get = db.prepare(`SELECT id,mbid,title FROM recordings WHERE id=?`);
    const credits = db.prepare(
        'SELECT a.mbid id,ra.artist_name name,ra.join_phrase joinphrase FROM recording_artists ra JOIN artists a ON a.id=ra.artist_id WHERE ra.recording_id=? ORDER BY ra.position',
    );
    const release = db.prepare(`SELECT r.mbid id,r.title,r.date,r.release_group_mbid releaseGroupId
        FROM tracks t JOIN releases r ON r.id=t.release_id WHERE t.recording_id=?
        ORDER BY r.date IS NULL,r.date DESC,r.mbid LIMIT 1`);
    const target = normalize(query);
    const ranked = [...candidates.values()]
        .flatMap((row) => {
            const rec = get.get(row.id) as { id: number; mbid: string; title: string } | undefined;
            if (!rec) return [];
            const ac = credits.all(rec.id) as ArtistCredit[];
            const title = normalize(rec.title);
            const all = new Set(tokensOf(rec.title + ' ' + ac.map((a) => a.name).join(' ')));
            const tier = title === target ? 0 : tokens.every((t) => all.has(t)) ? 1 : 2;
            return [{ rec, ac, tier, score: row.score }];
        })
        .sort(
            (a, b) => a.tier - b.tier || a.score - b.score || a.rec.mbid.localeCompare(b.rec.mbid),
        );
    // Counts are bounded like artist/group search. The candidate ceiling is part
    // of this contract; do not advertise pages the ranked window cannot supply.
    const result = ranked.slice(offset, offset + limit).map(({ rec, ac }) => ({
        id: rec.mbid,
        title: rec.title,
        'artist-credit': ac.map((a) => ({ ...a, joinphrase: a.joinphrase || null })),
        release:
            (release.get(rec.id) as
                RecordingSearchResult['recordings'][number]['release'] | undefined) ?? null,
    }));
    return { recordings: result, count: Math.min(total, ranked.length) };
}

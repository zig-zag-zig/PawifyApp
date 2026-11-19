import type { ArtistCredit } from '@pawify/shared';
import type { MusicDb } from './musicDbClient.js';
import type { RecordingSearchResult } from '../../features/artists/domain/searchResults.js';

const MAX_MATCHES = 10_000;
const CANDIDATES = 1200;
const SQL_CHUNK = 400;

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

const chunk = <T>(values: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
};

type RankedCandidate = {
    rec: { id: number; mbid: string; title: string };
    credits: ArtistCredit[];
    tier: number;
    score: number;
};

/**
 * Local recording search.
 *
 * Ranking candidates and page hydration are batched: credits are fetched for the
 * ranked window in one query per chunk, and representative releases only for the
 * final page. The old shape issued two statements per candidate, which turned a
 * broad query into thousands of synchronous SQLite calls on the event loop.
 */
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

    const candidateIds = [...candidates.values()].map((row) => row.id);
    const recordingsById = new Map<number, { id: number; mbid: string; title: string }>();
    const creditsByRecordingId = new Map<number, ArtistCredit[]>();

    for (const ids of chunk(candidateIds, SQL_CHUNK)) {
        const placeholders = ids.map(() => '?').join(',');
        const recordings = db
            .prepare(`SELECT id, mbid, title FROM recordings WHERE id IN (${placeholders})`)
            .all(...ids) as { id: number; mbid: string; title: string }[];
        for (const recording of recordings) recordingsById.set(recording.id, recording);

        const credits = db
            .prepare(
                `SELECT ra.recording_id, a.mbid AS id, ra.artist_name AS name, ra.join_phrase AS joinphrase
                 FROM recording_artists ra
                 JOIN artists a ON a.id = ra.artist_id
                 WHERE ra.recording_id IN (${placeholders})
                 ORDER BY ra.recording_id, ra.position`,
            )
            .all(...ids) as {
            recording_id: number;
            id: string;
            name: string;
            joinphrase: string;
        }[];
        for (const credit of credits) {
            const list = creditsByRecordingId.get(credit.recording_id) ?? [];
            list.push({
                id: credit.id,
                name: credit.name,
                joinphrase: credit.joinphrase || null,
            });
            creditsByRecordingId.set(credit.recording_id, list);
        }
    }

    const target = normalize(query);
    const ranked: RankedCandidate[] = [...candidates.values()]
        .flatMap((row) => {
            const rec = recordingsById.get(row.id);
            if (!rec) return [];
            const credits = creditsByRecordingId.get(rec.id) ?? [];
            const title = normalize(rec.title);
            const all = new Set(tokensOf(rec.title + ' ' + credits.map((a) => a.name).join(' ')));
            const tier = title === target ? 0 : tokens.every((t) => all.has(t)) ? 1 : 2;
            return [{ rec, credits, tier, score: row.score }];
        })
        .sort(
            (a, b) => a.tier - b.tier || a.score - b.score || a.rec.mbid.localeCompare(b.rec.mbid),
        );

    const page = ranked.slice(offset, offset + limit);
    const releasesByRecordingId = new Map<
        number,
        RecordingSearchResult['recordings'][number]['release']
    >();
    const pageIds = page.map(({ rec }) => rec.id);
    for (const ids of chunk(pageIds, SQL_CHUNK)) {
        const placeholders = ids.map(() => '?').join(',');
        const releases = db
            .prepare(
                `SELECT t.recording_id,
                        r.mbid AS id,
                        r.title,
                        r.date,
                        r.release_group_mbid AS releaseGroupId
                 FROM tracks t
                 JOIN releases r ON r.id = t.release_id
                 WHERE t.recording_id IN (${placeholders})
                 ORDER BY t.recording_id, r.date IS NULL, r.date DESC, r.mbid`,
            )
            .all(...ids) as {
            recording_id: number;
            id: string;
            title: string;
            date: string | null;
            releaseGroupId: string | null;
        }[];
        for (const release of releases) {
            if (!releasesByRecordingId.has(release.recording_id)) {
                releasesByRecordingId.set(release.recording_id, {
                    id: release.id,
                    title: release.title,
                    releaseGroupId: release.releaseGroupId,
                    date: release.date,
                });
            }
        }
    }

    const result = page.map(({ rec, credits }) => ({
        id: rec.mbid,
        title: rec.title,
        'artist-credit': credits,
        release: releasesByRecordingId.get(rec.id) ?? null,
    }));

    // Counts are bounded like artist/group search. The candidate ceiling is part
    // of this contract; do not advertise pages the ranked window cannot supply.
    return { recordings: result, count: Math.min(total, ranked.length) };
}

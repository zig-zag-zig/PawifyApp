import { createLogger } from '../../common/logging/logger.js';
import {
    getMusicDb,
    getMusicDbWriter,
    musicDbHandleHasEntityImages,
    type MusicDb,
} from './musicDbClient.js';

const logger = createLogger('infrastructure.musicDb.entityImages');

export type EntityImageEntityType = 'artist' | 'release_group' | 'release';

export type EntityImageService =
    'none' | 'pending' | 'caa_rel' | 'caa_rg' | 'deezer' | 'tidal' | 'discogs';

export type EntityImageRecord = {
    /** Reconstructed URL, or null when the mirror recorded a confirmed miss. */
    url: string | null;
    service: EntityImageService;
    /** Unix seconds; 0 means "derived offline from the dump", not "unknown". */
    fetchedAt: number;
};

const KNOWN_SERVICES: ReadonlySet<string> = new Set<string>([
    'none',
    'pending',
    'caa_rel',
    'caa_rg',
    'deezer',
    'tidal',
    'discogs',
]);

/**
 * SQLite caps a statement at 32k bound variables; 500 keeps the prepare cheap and
 * every page-sized lookup in a single round trip.
 */
const CHUNK_SIZE = 500;

type EntityImageRow = {
    mbid: string;
    service: string;
    urlTemplate: string;
    imageToken: string;
    fetchedAt: number;
};

/**
 * Cached per open handle: the table check costs two `PRAGMA table_info` calls and
 * the answer cannot change while a handle is open.
 */
let checkedHandle: MusicDb | null = null;
let handleHasTables = false;

const readerFor = (): MusicDb | null => {
    const db = getMusicDb();
    if (!db) {
        return null;
    }

    if (db !== checkedHandle) {
        checkedHandle = db;
        handleHasTables = musicDbHandleHasEntityImages(db);
        if (!handleHasTables) {
            logger.debug('mirror has no image-state tables; artwork falls back to providers');
        }
    }

    return handleHasTables ? db : null;
};

/**
 * Builds the public URL from the service template.
 *
 * `none` and `pending` carry no URL; a template without a token placeholder is
 * returned as-is, which is what makes a full-URI service such as Discogs work.
 */
const reconstructUrl = (urlTemplate: string, imageToken: string): string | null => {
    if (!urlTemplate) {
        return null;
    }
    const url = urlTemplate.includes('{token}')
        ? urlTemplate.replace(/\{token\}/g, imageToken)
        : urlTemplate;
    return url.trim().length > 0 ? url : null;
};

const DEEZER_PLACEHOLDER_HASHES: ReadonlySet<string> = new Set([
    '',
    'd41d8cd98f00b204e9800998ecf8427e',
    'e23066163f21176a822b54001ee648a2',
    'ebcf22e5c3a0eb3178b8a6f6bc1a5a6c',
    '1fecff61b191427ec4d2760a77527bf5',
    '4cc148453373e887d1956b6344a7b04f',
    'ea5412738dfcaf1df3606a5dd3e77e0e',
    'cd3568bb51e7d9e425797f9b4c10b7d3',
    'e7234aeff0081367e7e856b5fd54058e',
    'd0c8b1a4637dff406cc848e3e953dd63',
    'e5c8891f20f2efd5cc8bbfff59ea6efc',
    '96bc2f8cbab605ff6f5bb37e0e383758',
    'f016ad615a7117339f474ee37dca9f38',
    '88a1139d1346a66220b30ea37dca9f38',
    '7a3464a158821d1da6d82f1ce94740ff',
    '415714b66a5de709809dd3d05f58afe4',
    'bb76c2ee3b068726ab4c37b0aabdb57a',
    '58811c62614cff2335b7b925b5011aa0',
    '57c9bec3606bb72c0452f9ff96fa8d07',
    '62bf77663d769e5394d822868d2d8735',
    '7c73d1d63a05e594125d87cf0dc17e44',
    'a69dd9112ef5097c3d2641612791f2ef',
    '456ec1e60024583fd4c3a311ba8286bb',
    '072eba0568ff0fa42d540ce035774780',
    '324f63945fcdfd6bee2dca5416c76fa8',
    '35166c13f464371610f64f33805877ba',
    'd028c6a774e5e24ab384e3141baffbab',
    '762b80d2472f4b1490e307e357c5f790',
    'd21e8382ab5e1fd28b2bb63a13f45f82',
    '4ede85b4d56475a5e0edcb4c3b67c345',
    '1c2cd7a1c69703b1d4adc0eb782b4207',
    '3154bf8ff18c19e1e44a63d17a58ec79',
    '261d12371d6fdd40c3f578bcf90c14df',
    'ff4e14f369cf02544fb150e7bb86f9cc',
    '8b16568eff95a4781f821176f4f734f3',
    '1afc5d48047f775527934cbcfed6fdbd',
    'c77f176737a8f1ce9e38df5f5d3694f3',
    '9c37f6be17341071559a6d4c67afafa4',
]);

const isDeezerPlaceholderToken = (imageToken: string): boolean => {
    const match = /^(?:artist|cover)\/([^/]*)\//i.exec(imageToken.trim());
    if (!match) {
        return true;
    }
    return DEEZER_PLACEHOLDER_HASHES.has((match[1] ?? '').trim().toLowerCase());
};

const toRecord = (row: EntityImageRow): EntityImageRecord | null => {
    if (!KNOWN_SERVICES.has(row.service)) {
        return null;
    }

    if (row.service === 'deezer' && isDeezerPlaceholderToken(row.imageToken)) {
        // Treat a Deezer placeholder row as unresolved so the server runs the
        // live fallback chain instead of handing Deezer's silhouette to the app.
        return null;
    }

    return {
        url: reconstructUrl(row.urlTemplate, row.imageToken),
        service: row.service as EntityImageService,
        fetchedAt: row.fetchedAt,
    };
};

const readRows = (
    db: MusicDb,
    entityType: EntityImageEntityType,
    mbids: string[],
): EntityImageRow[] => {
    if (mbids.length === 0) {
        return [];
    }

    const placeholders = mbids.map(() => '?').join(', ');
    const statement = db.prepare(
        `SELECT ei.entity_mbid AS mbid,
                s.name AS service,
                s.url_template AS urlTemplate,
                ei.image_token AS imageToken,
                ei.fetched_at AS fetchedAt
         FROM entity_images ei
         JOIN image_services s ON s.id = ei.service_id
         WHERE ei.entity_type = ? AND ei.entity_mbid IN (${placeholders})`,
    );

    return statement.all(entityType, ...mbids) as EntityImageRow[];
};

/**
 * Artwork the mirror already knows for one entity, or null when it knows nothing.
 *
 * Never throws: a mirror without the image tables, a locked file, or a malformed
 * row all degrade to null so the caller runs its normal provider chain.
 */
export const readEntityImage = (
    entityType: EntityImageEntityType,
    mbid: string,
): EntityImageRecord | null => {
    if (!mbid) {
        return null;
    }
    return readEntityImages(entityType, [mbid]).get(mbid) ?? null;
};

export const readEntityImages = (
    entityType: EntityImageEntityType,
    mbids: readonly string[],
): Map<string, EntityImageRecord> => {
    const result = new Map<string, EntityImageRecord>();
    const db = readerFor();
    if (!db) {
        return result;
    }

    const unique = Array.from(new Set(mbids.filter((mbid) => mbid.length > 0)));
    if (unique.length === 0) {
        return result;
    }

    try {
        for (let index = 0; index < unique.length; index += CHUNK_SIZE) {
            const chunk = unique.slice(index, index + CHUNK_SIZE);
            for (const row of readRows(db, entityType, chunk)) {
                const record = toRecord(row);
                if (record) {
                    result.set(row.mbid, record);
                }
            }
        }
    } catch (error) {
        logger.debug('entity image lookup failed; falling back to providers', {
            entityType,
            count: unique.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return new Map();
    }

    return result;
};

/** Test-only: forget which handle the table capability was probed on. */
export const resetEntityImageRepositoryForTests = (): void => {
    checkedHandle = null;
    handleHasTables = false;
    writerCheckedHandle = null;
    writerWarned = false;
};

/* ------------------------------------------------------------------------- *
 * Writes
 * ------------------------------------------------------------------------- */

/** Service ids, mirroring `image_services` in the mirror. */
export const ENTITY_IMAGE_SERVICE_ID: Record<EntityImageService, number> = {
    none: 0,
    pending: 1,
    caa_rel: 2,
    caa_rg: 3,
    deezer: 4,
    tidal: 5,
    discogs: 6,
};

const isAllowedDiscogsImageHost = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return false;
        }
        const host = parsed.hostname.toLowerCase();
        return host === 'discogs.com' || host.endsWith('.discogs.com');
    } catch {
        return false;
    }
};
const DEEZER_MARKER = 'cdn-images.dzcdn.net/images/';
const TIDAL_MARKER = 'resources.tidal.com/images/';

const tokenAfter = (url: string, marker: string): string | null => {
    const index = url.indexOf(marker);
    if (index < 0) {
        return null;
    }
    const token = url.slice(index + marker.length).trim();
    return token.length > 0 ? token : null;
};

/**
 * Converts a resolved full URL back into the compact `(service, token)` pair the
 * mirror stores, so a live lookup costs one small row instead of a duplicated URL.
 *
 * Returns null when the URL does not belong to a known provider, in which case the
 * caller keeps the row untouched rather than recording a wrong token.
 */
export const toEntityImageToken = (
    url: string | null | undefined,
    entityId: string,
): { service: EntityImageService; token: string } | null => {
    if (url === null) {
        return { service: 'none', token: '' };
    }
    if (typeof url !== 'string' || url.trim().length === 0) {
        return null;
    }

    const trimmed = url.trim();
    const deezer = tokenAfter(trimmed, DEEZER_MARKER);
    if (deezer) {
        return isDeezerPlaceholderToken(deezer) ? null : { service: 'deezer', token: deezer };
    }

    const tidal = tokenAfter(trimmed, TIDAL_MARKER);
    if (tidal) {
        return { service: 'tidal', token: tidal };
    }

    if (trimmed.includes('coverartarchive.org/release-group/')) {
        return { service: 'caa_rg', token: entityId };
    }
    if (trimmed.includes('coverartarchive.org/release/')) {
        return { service: 'caa_rel', token: entityId };
    }
    if (isAllowedDiscogsImageHost(trimmed)) {
        return { service: 'discogs', token: trimmed };
    }

    return null;
};

let writerCheckedHandle: MusicDb | null = null;
let writerWarned = false;

const writerFor = (): MusicDb | null => {
    const db = getMusicDbWriter();
    if (!db) {
        if (!writerWarned) {
            writerWarned = true;
            logger.debug('mirror writer unavailable; resolved artwork is not persisted');
        }
        return null;
    }
    if (db !== writerCheckedHandle) {
        writerCheckedHandle = db;
    }
    return db;
};

export type EntityImageWrite = {
    entityType: EntityImageEntityType;
    entityId: string;
    service: EntityImageService;
    token: string;
    /** Unix seconds; 0 marks the state as permanent (`none` derived offline or settled). */
    fetchedAt?: number;
};

/**
 * Persists the outcome of one artwork lookup into the mirror.
 *
 * Writes are best-effort: a mirror that is missing, read-only, or locked by the
 * hourly sync must never fail a user request. The caller keeps serving the value it
 * just resolved either way.
 */
export const writeEntityImages = (writes: readonly EntityImageWrite[]): number => {
    if (writes.length === 0) {
        return 0;
    }
    const db = writerFor();
    if (!db) {
        return 0;
    }

    const statement = db.prepare(
        `INSERT INTO entity_images(entity_type, entity_mbid, service_id, image_token, fetched_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(entity_type, entity_mbid) DO UPDATE SET
             service_id = excluded.service_id,
             image_token = excluded.image_token,
             fetched_at = excluded.fetched_at`,
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    let written = 0;
    const run = db.transaction((batch: readonly EntityImageWrite[]) => {
        for (const write of batch) {
            statement.run(
                write.entityType,
                write.entityId,
                ENTITY_IMAGE_SERVICE_ID[write.service],
                write.token,
                write.fetchedAt ?? nowSeconds,
            );
            written += 1;
        }
    });

    try {
        run(writes);
        return written;
    } catch (error) {
        logger.warn('entity image write failed; value stays request-scoped', {
            count: writes.length,
            error: error instanceof Error ? error.message : String(error),
        });
        return 0;
    }
};

export const writeEntityImage = (write: EntityImageWrite): boolean =>
    writeEntityImages([write]) > 0;

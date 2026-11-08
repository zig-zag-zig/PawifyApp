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

const toRecord = (row: EntityImageRow): EntityImageRecord | null => {
    if (!KNOWN_SERVICES.has(row.service)) {
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
        return { service: 'deezer', token: deezer };
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
    if (trimmed.includes('i.discogs.com/') || trimmed.includes('img.discogs.com/')) {
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

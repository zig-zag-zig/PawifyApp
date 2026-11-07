import { createLogger } from '../../common/logging/logger.js';
import { getMusicDb, musicDbHandleHasEntityImages, type MusicDb } from './musicDbClient.js';

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
};

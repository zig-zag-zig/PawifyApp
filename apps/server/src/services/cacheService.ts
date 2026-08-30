import { createLogger } from '../common/logging/logger.js';
import { cacheConfig } from '../config/runtimeConfig.js';
import {
    deleteStateValues,
    getStateValue,
    saveStateValues,
    type DaprStateSaveItem,
} from '../infrastructure/dapr/daprStateStore.js';
import {
    serializeData,
    deserializeData,
    splitUtf8StringByByteSize,
    parseChunkMetadata,
    getEffectiveTtlInHours,
} from './cache/cacheSerialization.js';

const logger = createLogger('services.cache');

const MAX_REQUEST_SIZE = 1024 * 1024;
const METADATA_OVERHEAD = 100;
const DEFAULT_CACHE_TTL_HOURS = cacheConfig.defaultTtlHours;

const getSafeChunkSize = (key: string): number => {
    const chunkKeySize = Buffer.byteLength(`${key}:chunk0000`, 'utf-8');
    return MAX_REQUEST_SIZE - chunkKeySize - METADATA_OVERHEAD;
};

const getMetadataKey = (key: string): string => `${key}:metadata`;

const getChunkKeys = (key: string, totalChunks: number): string[] =>
    Array.from(
        { length: totalChunks },
        (_, index) => `${key}:chunk${index.toString().padStart(4, '0')}`,
    );

export const deleteCachedData = async (key: string): Promise<void> => {
    try {
        const metadataKey = getMetadataKey(key);
        const totalChunks = parseChunkMetadata(await getStateValue(metadataKey));
        const keysToDelete = [
            key,
            metadataKey,
            ...(totalChunks ? getChunkKeys(key, totalChunks) : []),
        ];

        await deleteStateValues(keysToDelete);
    } catch (error) {
        logger.error('delete cache failed', { key, error });
        throw error;
    }
};

const createStateSaveItem = (
    key: string,
    value: string,
    ttlInSeconds: number,
): DaprStateSaveItem => ({
    key,
    value,
    metadata: {
        ttlInSeconds: String(ttlInSeconds),
    },
});

const setCachedData = async (key: string, data: unknown, ttlInHours?: number): Promise<void> => {
    try {
        await deleteCachedData(key);

        const effectiveTtlInHours = getEffectiveTtlInHours(ttlInHours, DEFAULT_CACHE_TTL_HOURS);
        const ttlInSeconds = effectiveTtlInHours * 3600;
        const dataString = serializeData(data);
        const safeChunkSize = getSafeChunkSize(key);

        if (Buffer.byteLength(dataString, 'utf-8') <= safeChunkSize) {
            await saveStateValues([createStateSaveItem(key, dataString, ttlInSeconds)]);
            return;
        }

        const chunks = splitUtf8StringByByteSize(dataString, safeChunkSize);
        logger.debug('saving chunked cache value', { key, chunkCount: chunks.length });

        await saveStateValues([
            createStateSaveItem(
                getMetadataKey(key),
                JSON.stringify({ totalChunks: chunks.length }),
                ttlInSeconds,
            ),
            ...chunks.map((chunk, index) =>
                createStateSaveItem(
                    `${key}:chunk${index.toString().padStart(4, '0')}`,
                    chunk,
                    ttlInSeconds,
                ),
            ),
        ]);

        logger.debug('chunked cache value saved', { key, chunkCount: chunks.length });
    } catch (error) {
        logger.error('set cache failed', { key, error });
        throw error;
    }
};

export const getCachedData = async <T>(key: string): Promise<T | null> => {
    try {
        const metadata = await getStateValue(getMetadataKey(key));
        const totalChunks = parseChunkMetadata(metadata);

        if (!totalChunks) {
            const data = await getStateValue(key);
            return data ? deserializeData<T>(data) : null;
        }

        const chunkKeys = getChunkKeys(key, totalChunks);
        const chunkResults = await Promise.all(
            chunkKeys.map((chunkKey) => getStateValue(chunkKey)),
        );
        const chunks: string[] = [];
        let missingChunkCount = 0;

        for (const result of chunkResults) {
            if (typeof result !== 'string') {
                missingChunkCount += 1;
                continue;
            }

            chunks.push(result);
        }

        if (missingChunkCount > 0) {
            logger.warn('chunked cache value missing chunks', { key, missingChunkCount });
            await deleteCachedData(key);
            return null;
        }

        return deserializeData<T>(chunks.join(''));
    } catch (error) {
        logger.error('get cache failed', { key, error });
        throw error;
    }
};

export const replaceCachedData = async <T>(
    key: string,
    data: T,
    ttlInHours?: number,
): Promise<void> => {
    try {
        await setCachedData(key, data, ttlInHours);
    } catch (error) {
        logger.error('replace cache failed', { key, error });
        throw error;
    }
};

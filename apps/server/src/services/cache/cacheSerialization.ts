const UNDEFINED_MARKER = '__redis__undefined__';

export const serializeData = (data: unknown): string => {
    return JSON.stringify(data, (_, value) => (value === undefined ? UNDEFINED_MARKER : value));
};

export const deserializeData = <T = unknown>(dataString: string): T => {
    return JSON.parse(dataString, (_, value) =>
        value === UNDEFINED_MARKER ? undefined : value,
    ) as T;
};

export const splitUtf8StringByByteSize = (value: string, maxBytes: number): string[] => {
    const chunks: string[] = [];
    let currentChunk = '';
    let currentChunkBytes = 0;

    for (const char of value) {
        const charBytes = Buffer.byteLength(char, 'utf-8');

        if (charBytes > maxBytes) {
            throw new Error('A single character is larger than the Redis chunk size');
        }

        if (currentChunk && currentChunkBytes + charBytes > maxBytes) {
            chunks.push(currentChunk);
            currentChunk = '';
            currentChunkBytes = 0;
        }

        currentChunk += char;
        currentChunkBytes += charBytes;
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks;
};

export const parseChunkMetadata = (metadata: string | null): number | null => {
    if (!metadata) {
        return null;
    }

    try {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        const totalChunks = Number.parseInt(String(parsed.totalChunks ?? ''), 10);
        return Number.isFinite(totalChunks) && totalChunks > 0 ? totalChunks : null;
    } catch {
        return null;
    }
};

export const getEffectiveTtlInHours = (ttlInHours?: number, defaultTtlHours = 336): number =>
    ttlInHours && Number.isFinite(ttlInHours) && ttlInHours > 0 ? ttlInHours : defaultTtlHours;

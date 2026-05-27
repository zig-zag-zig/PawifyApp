type NullableStringMap = Record<string, string | null | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tryParseJson(value: unknown): unknown {
    if (typeof value !== 'string') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function normalizeNullableString(value: string): string | null {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : null;
}

function isTerminalMissingRecord(item: Record<string, unknown>): boolean {
    const terminalKeys = ['status', 'state', 'result', 'reason'];
    const terminalValues = new Set([
        'failed',
        'error',
        'missing',
        'not_found',
        'not-found',
        'none',
        'null',
        'unavailable',
        'no_result',
        'no-result',
    ]);

    if (item.found === false || item.exists === false) {
        return true;
    }

    return terminalKeys.some(key => {
        const value = item[key];
        return typeof value === 'string' && terminalValues.has(value.trim().toLowerCase());
    });
}

function extractNullableStringValue(value: unknown, depth = 0): string | null | undefined {
    if (depth > 4) {
        return undefined;
    }

    const parsedValue = tryParseJson(value);

    if (typeof parsedValue === 'string') {
        return normalizeNullableString(parsedValue);
    }

    if (parsedValue === null || parsedValue === undefined) {
        return parsedValue;
    }

    if (!isRecord(parsedValue)) {
        return undefined;
    }

    const valueKeys = [
        'image',
        'imageUrl',
        'image_url',
        'profileImage',
        'profileImageUrl',
        'profile_image',
        'profile_image_url',
        'cover',
        'coverUrl',
        'cover_url',
        'lyrics',
        'lyricsUrl',
        'lyrics_url',
        'remoteUrl',
        'remote_url',
        'url',
        'href',
        'value',
    ];

    for (const key of valueKeys) {
        if (!(key in parsedValue)) {
            continue;
        }

        const nestedValue = extractNullableStringValue(parsedValue[key], depth + 1);
        if (nestedValue !== undefined) {
            return nestedValue;
        }
    }

    if (isTerminalMissingRecord(parsedValue)) {
        return null;
    }

    const wrapperKeys = ['data', 'payload', 'result'];
    for (const key of wrapperKeys) {
        if (!(key in parsedValue)) {
            continue;
        }

        const nestedValue = extractNullableStringValue(parsedValue[key], depth + 1);
        if (nestedValue !== undefined) {
            return nestedValue;
        }
    }

    return undefined;
}

function extractIdFromItem(item: Record<string, unknown>): string | null {
    const idKeys = ['id', 'artistId', 'releaseId', 'releaseGroupId', 'trackId', 'key'];

    for (const key of idKeys) {
        const rawId = item[key];
        if (typeof rawId === 'string' && rawId.length > 0) {
            return rawId;
        }
    }

    return null;
}

function mapFromArray(value: unknown[]): NullableStringMap {
    const output: NullableStringMap = {};

    value.forEach(item => {
        if (Array.isArray(item) && item.length >= 2 && typeof item[0] === 'string') {
            const [key, mapValue] = item;
            const extractedValue = extractNullableStringValue(mapValue);
            if (extractedValue !== undefined) {
                output[key] = extractedValue;
            }
            return;
        }

        if (!isRecord(item)) {
            return;
        }

        const id = extractIdFromItem(item);
        const mapValue = extractNullableStringValue(item);
        if (id && mapValue !== undefined) {
            output[id] = mapValue;
        }
    });

    return output;
}

function toNullableStringMap(value: unknown): NullableStringMap {
    const parsedValue = tryParseJson(value);
    if (Array.isArray(parsedValue)) {
        return mapFromArray(parsedValue);
    }

    value = parsedValue;
    if (!isRecord(value)) {
        return {};
    }

    const output: NullableStringMap = {};
    Object.entries(value).forEach(([key, mapValue]) => {
        const directValue = extractNullableStringValue(mapValue);
        if (directValue !== undefined) {
            output[key] = directValue;
            return;
        }

        if (Array.isArray(mapValue)) {
            const nested = mapFromArray(mapValue);
            if (Object.keys(nested).length > 0) {
                Object.assign(output, nested);
            }
            return;
        }

    });

    return output;
}

function extractMapFromResult(
    result: unknown,
    candidateKeys: string[]
): NullableStringMap {
    const parsedResult = tryParseJson(result);
    result = parsedResult;

    if (!isRecord(result)) {
        if (Array.isArray(result)) {
            return mapFromArray(result);
        }

        return toNullableStringMap(result);
    }

    for (const key of candidateKeys) {
        if (key in result) {
            return extractMapFromResult(result[key], candidateKeys);
        }
    }

    for (const key of ['result', 'data', 'payload']) {
        if (key in result) {
            return extractMapFromResult(result[key], candidateKeys);
        }
    }

    return toNullableStringMap(result);
}

export function extractArtistProfileImages(result: unknown): NullableStringMap {
    return extractMapFromResult(result, ['artist_profile_images', 'artistProfileImages', 'artists']);
}

export function extractReleaseTrackLyrics(result: unknown): NullableStringMap {
    return extractMapFromResult(result, ['release_tracks_lyrics', 'releaseTracksLyrics', 'tracks']);
}

export function extractReleaseGroupCovers(result: unknown): NullableStringMap {
    return extractMapFromResult(result, ['release_group_covers', 'releaseGroupCovers', 'covers']);
}

export function extractReleaseGroupReleaseCovers(result: unknown): NullableStringMap {
    return extractMapFromResult(result, ['release_group_release_covers', 'releaseGroupReleaseCovers', 'covers']);
}

export function extractNewReleaseCovers(result: unknown): NullableStringMap {
    return extractMapFromResult(result, ['new_release_covers', 'newReleaseCovers', 'covers']);
}

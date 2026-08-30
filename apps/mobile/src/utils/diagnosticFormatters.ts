export type DiagnosticPayload = Record<string, unknown>;

const maxArrayItems = 8;
const maxObjectKeys = 14;
const maxStringLength = 240;

export function elapsedSince(startedAt: number | null | undefined): number | null {
    return typeof startedAt === 'number' ? Date.now() - startedAt : null;
}

export function shortenString(value: string, maxLength = maxStringLength): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength)}...`;
}

export function describeError(error: unknown): DiagnosticPayload {
    if (error instanceof Error) {
        const extra: DiagnosticPayload = {};
        const maybeApiError = error as Error & {
            statusCode?: number;
            responseBody?: string;
            responseData?: unknown;
            userMessage?: string;
        };

        if (maybeApiError.statusCode !== undefined) {
            extra.statusCode = maybeApiError.statusCode;
        }
        if (maybeApiError.userMessage !== undefined) {
            extra.userMessage = maybeApiError.userMessage;
        }
        if (maybeApiError.responseData !== undefined) {
            extra.responseShape = describeErrorResponseShape(maybeApiError.responseData);
        } else if (maybeApiError.responseBody !== undefined) {
            extra.responseBodyShape = describeErrorResponseShape(maybeApiError.responseBody);
        }

        return {
            name: error.name,
            message: error.message,
            ...extra,
        };
    }

    return {
        value: normalizeDiagnosticValue(error),
    };
}

export function describeIds(ids: string[], maxItems = maxArrayItems): DiagnosticPayload {
    const uniqueIds = [...new Set(ids.filter(Boolean))];

    return {
        count: uniqueIds.length,
        sample: uniqueIds.slice(0, maxItems),
        remaining: Math.max(0, uniqueIds.length - maxItems),
    };
}

export function describeNullableStringMap(
    map: Record<string, string | null | undefined>,
    expectedIds: string[] = [],
    maxItems = maxArrayItems
): DiagnosticPayload {
    const keys = Object.keys(map);
    const stringIds: string[] = [];
    const nullIds: string[] = [];
    const emptyStringIds: string[] = [];
    const undefinedIds: string[] = [];

    keys.forEach(key => {
        const value = map[key];
        if (typeof value === 'string' && value.trim().length > 0) {
            stringIds.push(key);
            return;
        }
        if (typeof value === 'string') {
            emptyStringIds.push(key);
            return;
        }
        if (value === null) {
            nullIds.push(key);
            return;
        }
        if (value === undefined) {
            undefinedIds.push(key);
        }
    });

    const missingExpectedIds = expectedIds.filter(id => map[id] === undefined);

    return {
        keyCount: keys.length,
        urls: stringIds.length,
        nulls: nullIds.length,
        emptyStrings: emptyStringIds.length,
        undefinedValues: undefinedIds.length,
        keySample: keys.slice(0, maxItems),
        missingExpected: describeIds(missingExpectedIds, maxItems),
        nullSample: nullIds.slice(0, maxItems),
    };
}

export function describeValueShape(value: unknown): DiagnosticPayload {
    if (Array.isArray(value)) {
        return {
            kind: 'array',
            length: value.length,
            sampleShapes: value.slice(0, 3).map(item => describeValueShape(item)),
        };
    }

    if (typeof value === 'string') {
        return {
            kind: 'string',
            length: value.length,
            preview: shortenString(value, 120),
        };
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record);
        return {
            kind: 'object',
            keyCount: keys.length,
            sampleKeys: keys.slice(0, maxArrayItems),
            status: typeof record.status === 'string' ? record.status : undefined,
            type: typeof record.type === 'string' ? record.type : undefined,
            taskId: typeof record.taskId === 'string' ? record.taskId : undefined,
        };
    }

    return {
        kind: value === null ? 'null' : typeof value,
        value,
    };
}

const describeErrorResponseShape = (value: unknown): DiagnosticPayload => {
    if (typeof value === 'string') {
        return {
            kind: 'string',
            length: value.length,
        };
    }

    return describeValueShape(value);
};

export function normalizeDiagnosticValue(value: unknown, depth = 0): unknown {
    if (depth > 4) {
        return '[MaxDepth]';
    }

    if (value instanceof Error) {
        return describeError(value);
    }

    if (typeof value === 'string') {
        return shortenString(value);
    }

    if (Array.isArray(value)) {
        return [
            ...value.slice(0, maxArrayItems).map(item => normalizeDiagnosticValue(item, depth + 1)),
            ...(value.length > maxArrayItems ? [`...${value.length - maxArrayItems} more`] : []),
        ];
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    const output: DiagnosticPayload = {};
    const entries = Object.entries(value as Record<string, unknown>);
    entries.slice(0, maxObjectKeys).forEach(([key, entryValue]) => {
        if (entryValue !== undefined) {
            output[key] = normalizeDiagnosticValue(entryValue, depth + 1);
        }
    });

    if (entries.length > maxObjectKeys) {
        output.__remainingKeys = entries.length - maxObjectKeys;
    }

    return output;
}

const INVALID_RTDB_KEY_CHARS = /[.$#[\]/]/;

export const assertRtdbKey = (name: string, value: string): void => {
    if (!value.trim() || INVALID_RTDB_KEY_CHARS.test(value)) {
        throw new Error(`Invalid input: ${name} is not a valid Realtime Database key.`);
    }
};

export const encodeRtdbKeySegment = (value: string): string =>
    Buffer.from(value, 'utf8').toString('base64url');

export const decodeRtdbKeySegment = (value: string): string | null => {
    try {
        const decoded = Buffer.from(value, 'base64url').toString('utf8');
        return encodeRtdbKeySegment(decoded) === value ? decoded : null;
    } catch {
        return null;
    }
};

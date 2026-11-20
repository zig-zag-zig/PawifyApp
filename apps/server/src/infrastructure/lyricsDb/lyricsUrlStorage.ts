/**
 * Compact, provider-agnostic storage form for a lyrics URL.
 *
 * Genius is the only provider with a fixed host, so its rows store the path
 * alone. MusicBrainz fallback relations can point at any allowlisted lyrics
 * host, so those rows keep `host/path`. Both forms drop the scheme, query
 * string, fragment, credentials and tracking parameters; the scheme is always
 * HTTPS and is restored on read.
 */
const GENIUS_HOST = 'genius.com';

const isGeniusHost = (hostname: string): boolean =>
    hostname === GENIUS_HOST || hostname.endsWith(`.${GENIUS_HOST}`);

export const compactLyricsUrlForStorage = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'https:' || !url.hostname) return trimmed;
        const path = url.pathname && url.pathname.length > 0 ? url.pathname : '/';
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (isGeniusHost(host)) {
            return path;
        }
        return `${host}${path}`;
    } catch {
        return trimmed;
    }
};

/**
 * Expands a stored compact URL back into a clickable HTTPS URL.
 *
 * A leading slash means the row is a Genius path. Legacy rows written before
 * compaction stored the full URL; those are returned unchanged so no
 * migration/backfill is required.
 */
export const expandStoredLyricsUrl = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('/')) return `https://${GENIUS_HOST}${trimmed}`;
    return `https://${trimmed.replace(/^\/+/, '')}`;
};

/**
 * Canonical form of a provider URL: identical to what the store keeps, expanded
 * back to a clickable HTTPS URL. Serving this keeps the client's copy and the
 * persisted copy in lockstep (same host spelling, no query/fragment).
 */
export const normalizeLyricsUrl = (value: string): string =>
    expandStoredLyricsUrl(compactLyricsUrlForStorage(value));

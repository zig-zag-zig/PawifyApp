/**
 * Compact, provider-agnostic storage form for a lyrics URL.
 *
 * Only the host and path identify the lyrics page. The scheme is always HTTPS
 * (the fallback allowlist and provider clients enforce it), so persisting
 * `host/path` is enough to reconstruct the link while avoiding stored query
 * strings, fragments, credentials, and provider tracking parameters.
 */
export const compactLyricsUrlForStorage = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    try {
        const url = new URL(trimmed);
        if (url.protocol !== 'https:' || !url.hostname) return trimmed;
        const path = url.pathname && url.pathname.length > 0 ? url.pathname : '/';
        return `${url.host.toLowerCase()}${path}`;
    } catch {
        return trimmed;
    }
};

/**
 * Expands a stored compact URL back into a clickable HTTPS URL.
 *
 * Legacy rows written before compaction stored the full URL; those are returned
 * unchanged so no migration/backfill is required.
 */
export const expandStoredLyricsUrl = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed.replace(/^\/+/, '')}`;
};

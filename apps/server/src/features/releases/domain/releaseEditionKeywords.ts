/**
 * Edition keywords that turn a pressing into a content event.
 *
 * Centralized on purpose: detection compares the keyword set over time, so adding
 * a keyword later must affect both the stored baseline and the next scan the same
 * way. Matching is exact-token based ("remaster" matches "Remastered", but not
 * "master"), which keeps unrelated titles from producing notifications.
 */
export const EDITION_KEYWORDS = [
    'deluxe',
    'expanded',
    'remaster',
    'remastered',
    'anniversary',
    'bonus',
    'extended',
    'special',
    'complete',
    'ultimate',
] as const;

const EDITION_KEYWORD_SET = new Set<string>(EDITION_KEYWORDS);

/** MusicBrainz statuses are compared case-insensitively; only Official notifies. */
export const isOfficialReleaseStatus = (status: string | null | undefined): boolean =>
    status?.trim().toLowerCase() === 'official';

const tokenize = (value: string | null | undefined): string[] =>
    (value ?? '')
        .normalize('NFKD')
        // Strip combining marks so `DÉLUXE` tokenizes as `deluxe` rather than
        // splitting at the accent.
        .replace(/\p{M}+/gu, '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);

/**
 * Stable keyword order: always the canonical list order, never document order.
 * Detection stores the result, so a different order would look like a change.
 */
export const normalizeEditionKeywords = (keywords: readonly string[]): string[] => {
    const present = new Set(keywords.map((keyword) => keyword.trim().toLowerCase()));
    return EDITION_KEYWORDS.filter((keyword) => present.has(keyword));
};

/**
 * Extracts edition keywords from a release title and its disambiguation.
 *
 * Deduplicates across both fields and returns them in canonical order.
 */
export const extractEditionKeywords = (
    title: string | null | undefined,
    disambiguation: string | null | undefined,
): string[] => {
    const tokens = new Set([...tokenize(title), ...tokenize(disambiguation)]);
    return EDITION_KEYWORDS.filter((keyword) => tokens.has(keyword));
};

export const hasEditionKeyword = (keyword: string): boolean =>
    EDITION_KEYWORD_SET.has(keyword);
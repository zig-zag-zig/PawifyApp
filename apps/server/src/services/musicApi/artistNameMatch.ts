/**
 * Comparison helpers for artist names coming from different providers.
 */

/**
 * Folds a name down to a comparable form: case, diacritics, punctuation and
 * whitespace differences are ignored. "Beyoncé" and "Beyonce" match; so do
 * "Conway The Machine" and "Conway the Machine".
 */
export const normalizeArtistName = (name: string): string =>
    name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

/**
 * True when both names normalize to the same non-empty string.
 */
export const artistNamesMatch = (left: string | undefined, right: string | undefined): boolean => {
    if (!left || !right) {
        return false;
    }

    const normalizedLeft = normalizeArtistName(left);
    return normalizedLeft.length > 0 && normalizedLeft === normalizeArtistName(right);
};

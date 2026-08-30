import { describe, expect, it } from 'vitest';
import { normalizeVersion, parseVersionParts, compareVersions, parseRepoUrl } from './versionUtils';

describe('normalizeVersion', () => {
    it('removes leading v', () => {
        expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    });

    it('is case-insensitive for v prefix', () => {
        expect(normalizeVersion('V1.2.3')).toBe('1.2.3');
    });

    it('strips build metadata after +', () => {
        expect(normalizeVersion('1.2.3+build456')).toBe('1.2.3');
    });

    it('trims whitespace', () => {
        expect(normalizeVersion('  1.2.3  ')).toBe('1.2.3');
    });

    it('handles plain version', () => {
        expect(normalizeVersion('1.0.0')).toBe('1.0.0');
    });
});

describe('parseVersionParts', () => {
    it('parses three-part version', () => {
        expect(parseVersionParts('1.2.3')).toEqual([1, 2, 3]);
    });

    it('parses two-part version', () => {
        expect(parseVersionParts('1.2')).toEqual([1, 2]);
    });

    it('strips pre-release suffix', () => {
        expect(parseVersionParts('1.2.3-beta.1')).toEqual([1, 2, 3]);
    });

    it('removes leading v', () => {
        expect(parseVersionParts('v2.0.0')).toEqual([2, 0, 0]);
    });

    it('returns null for non-numeric parts', () => {
        expect(parseVersionParts('1.x.3')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseVersionParts('')).toBeNull();
    });
});

describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
        expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    });

    it('returns 1 when a > b', () => {
        expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
    });

    it('returns -1 when a < b', () => {
        expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('compares major version first', () => {
        expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    });

    it('treats shorter version as padded with zeros', () => {
        expect(compareVersions('1.0', '1.0.0')).toBe(0);
    });

    it('returns 1 for unparseable versions that differ', () => {
        expect(compareVersions('abc', 'xyz')).toBe(1);
    });

    it('returns 0 for unparseable versions that normalize the same', () => {
        expect(compareVersions('abc', 'abc')).toBe(0);
    });
});

describe('parseRepoUrl', () => {
    it('parses valid GitHub URL', () => {
        expect(parseRepoUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('strips .git suffix', () => {
        expect(parseRepoUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('returns null for null', () => {
        expect(parseRepoUrl(null)).toBeNull();
    });

    it('returns null for URL without owner and repo', () => {
        expect(parseRepoUrl('https://github.com/')).toBeNull();
    });

    it('returns null for URL with only owner', () => {
        expect(parseRepoUrl('https://github.com/owner')).toBeNull();
    });
});

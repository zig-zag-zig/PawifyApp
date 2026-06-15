import { describe, expect, it } from 'vitest';
import {
    parseNumberEnv,
    parseFloatEnv,
    parseBooleanEnv,
    parseApiBaseUrl,
    parseApiVersion,
    parseOptionalGitHubRepoUrl,
    parseOptionalFirebaseProjectId,
} from './envParsing';

describe('parseNumberEnv', () => {
    it('returns fallback for undefined', () => {
        expect(parseNumberEnv(undefined, 42)).toBe(42);
    });

    it('parses valid number', () => {
        expect(parseNumberEnv('100', 0)).toBe(100);
    });

    it('returns fallback for non-numeric string', () => {
        expect(parseNumberEnv('abc', 42)).toBe(42);
    });

    it('returns fallback for negative below min', () => {
        expect(parseNumberEnv('-5', 0, 0)).toBe(0);
    });

    it('accepts negative when min allows', () => {
        expect(parseNumberEnv('-5', 0, -10)).toBe(-5);
    });

    it('uses default min of 0', () => {
        expect(parseNumberEnv('0', 42)).toBe(0);
    });

    it('returns fallback for Infinity', () => {
        expect(parseNumberEnv('Infinity', 42)).toBe(42);
    });
});

describe('parseFloatEnv', () => {
    it('returns fallback for undefined', () => {
        expect(parseFloatEnv(undefined, 0.5)).toBe(0.5);
    });

    it('parses valid float', () => {
        expect(parseFloatEnv('0.75', 0)).toBe(0.75);
    });

    it('returns fallback for NaN', () => {
        expect(parseFloatEnv('abc', 0.5)).toBe(0.5);
    });

    it('returns fallback when below min', () => {
        expect(parseFloatEnv('-1', 0, 0, 1)).toBe(0);
    });

    it('returns fallback when above max', () => {
        expect(parseFloatEnv('1.5', 0, 0, 1)).toBe(0);
    });

    it('accepts value at boundary', () => {
        expect(parseFloatEnv('1', 0, 0, 1)).toBe(1);
    });
});

describe('parseBooleanEnv', () => {
    it('returns fallback for undefined', () => {
        expect(parseBooleanEnv(undefined)).toBe(false);
    });

    it('returns true for "true"', () => {
        expect(parseBooleanEnv('true')).toBe(true);
    });

    it('returns true for "1"', () => {
        expect(parseBooleanEnv('1')).toBe(true);
    });

    it('returns true for "yes"', () => {
        expect(parseBooleanEnv('yes')).toBe(true);
    });

    it('returns false for "false"', () => {
        expect(parseBooleanEnv('false')).toBe(false);
    });

    it('returns false for "0"', () => {
        expect(parseBooleanEnv('0')).toBe(false);
    });

    it('returns false for "no"', () => {
        expect(parseBooleanEnv('no')).toBe(false);
    });

    it('returns fallback for unrecognized value', () => {
        expect(parseBooleanEnv('maybe', true)).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(parseBooleanEnv('TRUE')).toBe(true);
        expect(parseBooleanEnv('FALSE')).toBe(false);
    });

    it('trims whitespace', () => {
        expect(parseBooleanEnv('  true  ')).toBe(true);
    });
});

describe('parseApiBaseUrl', () => {
    it('accepts valid https URL', () => {
        expect(parseApiBaseUrl('https://api.example.com')).toBe('https://api.example.com/');
    });

    it('accepts valid http URL', () => {
        expect(parseApiBaseUrl('http://localhost:3000')).toBe('http://localhost:3000/');
    });

    it('preserves existing trailing slash', () => {
        expect(parseApiBaseUrl('https://api.example.com/')).toBe('https://api.example.com/');
    });

    it('throws for missing protocol', () => {
        expect(() => parseApiBaseUrl('api.example.com')).toThrow('must start with http:// or https://');
    });

    it('throws for ftp protocol', () => {
        expect(() => parseApiBaseUrl('ftp://files.example.com')).toThrow('must start with http:// or https://');
    });

    it('trims whitespace', () => {
        expect(parseApiBaseUrl('  https://api.example.com  ')).toBe('https://api.example.com/');
    });
});

describe('parseApiVersion', () => {
    it('returns fallback for undefined', () => {
        expect(parseApiVersion(undefined)).toBe('v1');
    });

    it('parses "v1"', () => {
        expect(parseApiVersion('v1')).toBe('v1');
    });

    it('parses "v2"', () => {
        expect(parseApiVersion('v2')).toBe('v2');
    });

    it('parses bare number "1" as "v1"', () => {
        expect(parseApiVersion('1')).toBe('v1');
    });

    it('strips leading/trailing slashes', () => {
        expect(parseApiVersion('/v2/')).toBe('v2');
    });

    it('is case-insensitive', () => {
        expect(parseApiVersion('V3')).toBe('v3');
    });

    it('throws for invalid format', () => {
        expect(() => parseApiVersion('abc')).toThrow('must look like v1, v2, etc.');
    });

    it('throws for v0', () => {
        expect(() => parseApiVersion('v0')).toThrow('must look like v1, v2, etc.');
    });
});

describe('parseOptionalGitHubRepoUrl', () => {
    it('returns null for undefined', () => {
        expect(parseOptionalGitHubRepoUrl(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseOptionalGitHubRepoUrl('')).toBeNull();
    });

    it('parses valid GitHub URL', () => {
        expect(parseOptionalGitHubRepoUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
    });

    it('strips .git suffix', () => {
        expect(parseOptionalGitHubRepoUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    });

    it('throws for non-GitHub URL', () => {
        expect(() => parseOptionalGitHubRepoUrl('https://gitlab.com/owner/repo')).toThrow('must start with https://github.com/');
    });

    it('throws for http protocol', () => {
        expect(() => parseOptionalGitHubRepoUrl('http://github.com/owner/repo')).toThrow('must start with https://github.com/');
    });

    it('throws for invalid URL', () => {
        expect(() => parseOptionalGitHubRepoUrl('not-a-url')).toThrow('must be a valid GitHub repository URL');
    });

    it('throws for missing repo', () => {
        expect(() => parseOptionalGitHubRepoUrl('https://github.com/owner')).toThrow('must include owner and repo');
    });
});

describe('parseOptionalFirebaseProjectId', () => {
    it('returns null for undefined', () => {
        expect(parseOptionalFirebaseProjectId(undefined, 'development')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseOptionalFirebaseProjectId('', 'development')).toBeNull();
    });

    it('accepts valid project ID', () => {
        expect(parseOptionalFirebaseProjectId('my-project-123', 'development')).toBe('my-project-123');
    });

    it('throws for production environment', () => {
        expect(() => parseOptionalFirebaseProjectId('my-project', 'production')).toThrow('cannot be set for production');
    });

    it('throws for project ID starting with number', () => {
        expect(() => parseOptionalFirebaseProjectId('1invalid', 'development')).toThrow('valid Firebase project id');
    });

    it('throws for project ID with special characters', () => {
        expect(() => parseOptionalFirebaseProjectId('my_project!', 'development')).toThrow('valid Firebase project id');
    });

    it('throws for too short ID', () => {
        expect(() => parseOptionalFirebaseProjectId('ab', 'development')).toThrow('valid Firebase project id');
    });

    it('accepts ID starting with letter', () => {
        expect(parseOptionalFirebaseProjectId('a1234', 'development')).toBe('a1234');
    });
});

export type ParsedRepo = {
    owner: string;
    repo: string;
};

export function parseRepoUrl(repoUrl: string | null): ParsedRepo | null {
    if (!repoUrl) return null;

    const parsed = new URL(repoUrl);
    const [owner, rawRepo] = parsed.pathname.split('/').filter(Boolean);
    const repo = rawRepo?.replace(/\.git$/i, '');

    if (!owner || !repo) return null;

    return { owner, repo };
}

export function normalizeVersion(value: string): string {
    return value.trim().replace(/^v/i, '').split('+')[0];
}

export function parseVersionParts(value: string): number[] | null {
    const normalized = normalizeVersion(value).split('-')[0];
    const parts = normalized.split('.');

    if (parts.length === 0 || parts.some(part => !/^\d+$/.test(part))) {
        return null;
    }

    return parts.map(part => Number.parseInt(part, 10));
}

export function compareVersions(a: string, b: string): number {
    const aParts = parseVersionParts(a);
    const bParts = parseVersionParts(b);

    if (!aParts || !bParts) {
        return normalizeVersion(a) === normalizeVersion(b) ? 0 : 1;
    }

    const length = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < length; i += 1) {
        const left = aParts[i] ?? 0;
        const right = bParts[i] ?? 0;
        if (left > right) return 1;
        if (left < right) return -1;
    }

    return 0;
}

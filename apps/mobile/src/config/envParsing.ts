export function parseNumberEnv(value: string | undefined, fallback: number, min = 0): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min) {
        return fallback;
    }

    return parsed;
}

export function parseFloatEnv(value: string | undefined, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number {
    if (!value) {
        return fallback;
    }

    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        return fallback;
    }

    return parsed;
}

export function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
    if (!value) {
        return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
    }

    return fallback;
}

export function parseApiBaseUrl(value: string): string {
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
        throw new Error('[env] EXPO_PUBLIC_API_BASE_URL must start with http:// or https://');
    }

    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function parseApiVersion(value: string | undefined, fallback = 'v1'): string {
    let normalized = value?.trim() || fallback;
    normalized = normalized.replace(/^\/+|\/+$/g, '').toLowerCase();

    if (/^\d+$/.test(normalized)) {
        normalized = `v${normalized}`;
    }

    if (!/^v[1-9]\d*$/.test(normalized)) {
        throw new Error('[env] EXPO_PUBLIC_API_VERSION must look like v1, v2, etc.');
    }

    return normalized;
}

export function parseOptionalGitHubRepoUrl(value: string | undefined): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must be a valid GitHub repository URL');
    }

    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
        throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must start with https://github.com/');
    }

    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const [owner, rawRepo] = pathParts;
    const repo = rawRepo?.replace(/\.git$/i, '');
    if (!owner || !repo || pathParts.length < 2) {
        throw new Error('[env] EXPO_PUBLIC_UPDATE_GITHUB_REPO_URL must include owner and repo');
    }

    return `https://github.com/${owner}/${repo}`;
}

export function parseOptionalFirebaseProjectId(value: string | undefined, appEnv: string): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }

    if (appEnv === 'production') {
        throw new Error('[env] EXPO_PUBLIC_FIREBASE_PROJECT_ID cannot be set for production builds');
    }

    if (!/^[a-z][a-z0-9-]{4,29}$/i.test(trimmed)) {
        throw new Error('[env] EXPO_PUBLIC_FIREBASE_PROJECT_ID must be a valid Firebase project id');
    }

    return trimmed;
}

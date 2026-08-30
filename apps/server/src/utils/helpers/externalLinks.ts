import type {
    ExternalLink,
    ExternalLinkCategory,
    ExternalLinkService,
} from '../../modules/models/models.js';

type ExternalLinkRule = {
    service: ExternalLinkService;
    label: string;
    category: ExternalLinkCategory;
    matches: (url: URL, relationType: string) => boolean;
};

const hostIs = (url: URL, host: string): boolean =>
    url.hostname === host || url.hostname.endsWith(`.${host}`);

const pathIncludes = (url: URL, value: string): boolean =>
    url.pathname.toLowerCase().includes(value);

const relationIncludes = (relationType: string, value: string): boolean =>
    relationType.toLowerCase().includes(value);

const EXTERNAL_LINK_RULES: ExternalLinkRule[] = [
    {
        service: 'spotify',
        label: 'Spotify',
        category: 'streaming',
        matches: (url) => hostIs(url, 'spotify.com'),
    },
    {
        service: 'appleMusic',
        label: 'Apple Music',
        category: 'streaming',
        matches: (url) => hostIs(url, 'music.apple.com') || hostIs(url, 'itunes.apple.com'),
    },
    {
        service: 'youtubeMusic',
        label: 'YouTube Music',
        category: 'streaming',
        matches: (url) => hostIs(url, 'music.youtube.com'),
    },
    {
        service: 'youtube',
        label: 'YouTube',
        category: 'streaming',
        matches: (url) => hostIs(url, 'youtube.com') || hostIs(url, 'youtu.be'),
    },
    {
        service: 'bandcamp',
        label: 'Bandcamp',
        category: 'streaming',
        matches: (url) => hostIs(url, 'bandcamp.com'),
    },
    {
        service: 'soundcloud',
        label: 'SoundCloud',
        category: 'streaming',
        matches: (url) => hostIs(url, 'soundcloud.com'),
    },
    {
        service: 'tidal',
        label: 'Tidal',
        category: 'streaming',
        matches: (url) => hostIs(url, 'tidal.com'),
    },
    {
        service: 'deezer',
        label: 'Deezer',
        category: 'streaming',
        matches: (url) => hostIs(url, 'deezer.com'),
    },
    {
        service: 'qobuz',
        label: 'Qobuz',
        category: 'streaming',
        matches: (url) => hostIs(url, 'qobuz.com'),
    },
    {
        service: 'beatport',
        label: 'Beatport',
        category: 'streaming',
        matches: (url) => hostIs(url, 'beatport.com'),
    },
    {
        service: 'amazonMusic',
        label: 'Amazon Music',
        category: 'streaming',
        matches: (url) =>
            hostIs(url, 'music.amazon.com') ||
            ((hostIs(url, 'amazon.com') || hostIs(url, 'amazon.co.uk')) &&
                pathIncludes(url, '/music')),
    },
    {
        service: 'discogs',
        label: 'Discogs',
        category: 'database',
        matches: (url) => hostIs(url, 'discogs.com'),
    },
    {
        service: 'wikidata',
        label: 'Wikidata',
        category: 'database',
        matches: (url) => hostIs(url, 'wikidata.org'),
    },
    {
        service: 'wikipedia',
        label: 'Wikipedia',
        category: 'database',
        matches: (url) => hostIs(url, 'wikipedia.org'),
    },
    {
        service: 'allMusic',
        label: 'AllMusic',
        category: 'database',
        matches: (url) => hostIs(url, 'allmusic.com'),
    },
    {
        service: 'rateYourMusic',
        label: 'Rate Your Music',
        category: 'database',
        matches: (url) => hostIs(url, 'rateyourmusic.com'),
    },
    {
        service: 'lastFm',
        label: 'Last.fm',
        category: 'database',
        matches: (url) => hostIs(url, 'last.fm'),
    },
    {
        service: 'genius',
        label: 'Genius',
        category: 'lyrics',
        matches: (url) => hostIs(url, 'genius.com'),
    },
    {
        service: 'setlistFm',
        label: 'setlist.fm',
        category: 'live',
        matches: (url) => hostIs(url, 'setlist.fm'),
    },
    {
        service: 'songkick',
        label: 'Songkick',
        category: 'live',
        matches: (url) => hostIs(url, 'songkick.com'),
    },
    {
        service: 'bandsintown',
        label: 'Bandsintown',
        category: 'live',
        matches: (url) => hostIs(url, 'bandsintown.com'),
    },
    {
        service: 'instagram',
        label: 'Instagram',
        category: 'social',
        matches: (url) => hostIs(url, 'instagram.com'),
    },
    {
        service: 'facebook',
        label: 'Facebook',
        category: 'social',
        matches: (url) => hostIs(url, 'facebook.com') || hostIs(url, 'fb.com'),
    },
    {
        service: 'myspace',
        label: 'Myspace',
        category: 'social',
        matches: (url) => hostIs(url, 'myspace.com'),
    },
    {
        service: 'tumblr',
        label: 'Tumblr',
        category: 'social',
        matches: (url) => hostIs(url, 'tumblr.com'),
    },
    {
        service: 'x',
        label: 'X',
        category: 'social',
        matches: (url) => hostIs(url, 'x.com') || hostIs(url, 'twitter.com'),
    },
    {
        service: 'tiktok',
        label: 'TikTok',
        category: 'social',
        matches: (url) => hostIs(url, 'tiktok.com'),
    },
    {
        service: 'patreon',
        label: 'Patreon',
        category: 'store',
        matches: (url) => hostIs(url, 'patreon.com'),
    },
    {
        service: 'linktree',
        label: 'Linktree',
        category: 'other',
        matches: (url) => hostIs(url, 'linktr.ee') || hostIs(url, 'linktree.com'),
    },
    {
        service: 'official',
        label: 'Official',
        category: 'official',
        matches: (_url, relationType) =>
            relationIncludes(relationType, 'official') ||
            relationIncludes(relationType, 'homepage'),
    },
];

const normalizeHost = (hostname: string): string => hostname.replace(/^www\./, '').toLowerCase();

const labelFromHost = (hostname: string): string => {
    const host = normalizeHost(hostname);
    const parts = host.split('.');
    const base = parts.length > 1 ? parts[parts.length - 2] : parts[0];

    return (
        base
            .split(/[-_]/)
            .filter(Boolean)
            .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
            .join(' ') || host
    );
};

const normalizeUrl = (url: string): string | null => {
    const trimmed = url.trim();
    if (!trimmed) {
        return null;
    }

    try {
        return new URL(trimmed).toString();
    } catch {
        try {
            return new URL(`https://${trimmed}`).toString();
        } catch {
            return null;
        }
    }
};

const getRelationUrlResources = (relation: any): string[] => {
    const relationUrl = relation?.url;
    const urls = Array.isArray(relationUrl) ? relationUrl : [relationUrl];

    return urls.flatMap((urlEntry) => {
        if (typeof urlEntry === 'string') {
            return [urlEntry];
        }

        const resource = urlEntry?.resource;
        return typeof resource === 'string' ? [resource] : [];
    });
};

const dedupeExternalLinks = (links: ExternalLink[]): ExternalLink[] => {
    const seenUrls = new Set<string>();
    const result: ExternalLink[] = [];

    for (const link of links) {
        const normalizedUrl = normalizeUrl(link.url);
        if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
            continue;
        }

        seenUrls.add(normalizedUrl);
        result.push({ ...link, url: normalizedUrl });
    }

    return result;
};

const mapUrlToExternalLink = (url: string, relationType = ''): ExternalLink | null => {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
        return null;
    }

    const parsedUrl = new URL(normalizedUrl);
    const normalizedHost = normalizeHost(parsedUrl.hostname);
    const rule = EXTERNAL_LINK_RULES.find((candidate) =>
        candidate.matches(parsedUrl, relationType),
    );

    if (rule) {
        return {
            service: rule.service,
            label: rule.label,
            url: normalizedUrl,
            icon: rule.service,
            category: rule.category,
        };
    }

    return {
        service: 'other',
        label: labelFromHost(normalizedHost),
        url: normalizedUrl,
        icon: 'other',
        category: 'other',
    };
};

export const mapUrlsToExternalLinks = (urls: string[], relationType = ''): ExternalLink[] =>
    dedupeExternalLinks(
        urls.flatMap((url) => {
            const link = mapUrlToExternalLink(url, relationType);
            return link ? [link] : [];
        }),
    );

export const mapRelationsToExternalLinks = (relations: any[] | undefined): ExternalLink[] => {
    if (!relations || relations.length === 0) {
        return [];
    }

    return dedupeExternalLinks(
        relations.flatMap((relation) => {
            const relationType = typeof relation?.type === 'string' ? relation.type : '';
            return getRelationUrlResources(relation).flatMap((url) => {
                const link = mapUrlToExternalLink(url, relationType);
                return link ? [link] : [];
            });
        }),
    );
};

export const getExternalLinkUrlsByService = (
    externalLinks: ExternalLink[] | undefined,
    service: ExternalLinkService,
): string[] =>
    dedupeExternalLinks(externalLinks ?? [])
        .filter((link) => link.service === service)
        .map((link) => link.url);

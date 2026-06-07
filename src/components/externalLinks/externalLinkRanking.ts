import type { ExternalLink, ExternalLinkCategory, ExternalLinkService } from '../../shared/music';
import type { BrandIconSlug } from './brandIconPaths';

export type ExternalLinkIconConfig =
    | { family: 'materialCommunity'; name: string }
    | { family: 'fontisto'; name: string }
    | { family: 'fontAwesome6'; name: string; brand?: boolean; solid?: boolean }
    | { family: 'brandSvg'; slug: BrandIconSlug }
    | { family: 'wikidata' }
    | { family: 'text'; text: string };

export type RankedExternalLink = ExternalLink & {
    normalizedUrl: string;
    resolvedService: ExternalLinkService;
    displayLabel: string;
    rank: number;
};

const MAX_FEATURED_LINKS = 7;

const STREAMING_SERVICES = new Set<ExternalLinkService>([
    'spotify',
    'appleMusic',
    'youtubeMusic',
    'youtube',
    'soundcloud',
    'bandcamp',
    'tidal',
    'deezer',
    'amazonMusic',
    'qobuz',
    'beatport',
]);

const PERSONAL_SERVICES = new Set<ExternalLinkService>([
    'official',
    'linktree',
    'instagram',
    'tiktok',
    'x',
    'facebook',
    'myspace',
    'tumblr',
    'patreon',
]);

const SERVICE_LABELS: Record<ExternalLinkService, string> = {
    spotify: 'Spotify',
    appleMusic: 'Apple Music',
    youtube: 'YouTube',
    youtubeMusic: 'YouTube Music',
    bandcamp: 'Bandcamp',
    soundcloud: 'SoundCloud',
    tidal: 'TIDAL',
    deezer: 'Deezer',
    qobuz: 'Qobuz',
    amazonMusic: 'Amazon Music',
    beatport: 'Beatport',
    discogs: 'Discogs',
    wikidata: 'Wikidata',
    wikipedia: 'Wikipedia',
    allMusic: 'AllMusic',
    rateYourMusic: 'Rate Your Music',
    lastFm: 'Last.fm',
    genius: 'Genius',
    setlistFm: 'Setlist.fm',
    songkick: 'Songkick',
    bandsintown: 'Bandsintown',
    instagram: 'Instagram',
    facebook: 'Facebook',
    myspace: 'MySpace',
    tumblr: 'Tumblr',
    x: 'X',
    tiktok: 'TikTok',
    patreon: 'Patreon',
    linktree: 'Linktree',
    official: 'Official',
    other: 'Link',
};

const ICON_BY_SERVICE: Record<ExternalLinkService, ExternalLinkIconConfig> = {
    spotify: { family: 'fontAwesome6', name: 'spotify', brand: true },
    appleMusic: { family: 'fontisto', name: 'applemusic' },
    youtube: { family: 'fontAwesome6', name: 'youtube', brand: true },
    youtubeMusic: { family: 'fontAwesome6', name: 'youtube', brand: true },
    bandcamp: { family: 'fontAwesome6', name: 'bandcamp', brand: true },
    soundcloud: { family: 'fontAwesome6', name: 'soundcloud', brand: true },
    tidal: { family: 'brandSvg', slug: 'tidal' },
    deezer: { family: 'fontAwesome6', name: 'deezer', brand: true },
    qobuz: { family: 'text', text: 'Q' },
    amazonMusic: { family: 'fontAwesome6', name: 'amazon', brand: true },
    beatport: { family: 'brandSvg', slug: 'beatport' },
    discogs: { family: 'brandSvg', slug: 'discogs' },
    wikidata: { family: 'wikidata' },
    wikipedia: { family: 'fontAwesome6', name: 'wikipedia-w', brand: true },
    allMusic: { family: 'text', text: 'all' },
    rateYourMusic: { family: 'text', text: 'RYM' },
    lastFm: { family: 'fontAwesome6', name: 'lastfm', brand: true },
    genius: { family: 'text', text: 'G' },
    setlistFm: { family: 'materialCommunity', name: 'microphone' },
    songkick: { family: 'text', text: 'SK' },
    bandsintown: { family: 'text', text: 'B' },
    instagram: { family: 'fontAwesome6', name: 'instagram', brand: true },
    facebook: { family: 'fontAwesome6', name: 'facebook', brand: true },
    myspace: { family: 'brandSvg', slug: 'myspace' },
    tumblr: { family: 'brandSvg', slug: 'tumblr' },
    x: { family: 'fontAwesome6', name: 'x-twitter', brand: true },
    tiktok: { family: 'fontAwesome6', name: 'tiktok', brand: true },
    patreon: { family: 'fontAwesome6', name: 'patreon', brand: true },
    linktree: { family: 'materialCommunity', name: 'link-variant' },
    official: { family: 'materialCommunity', name: 'web' },
    other: { family: 'materialCommunity', name: 'link-variant' },
};

const COLOR_BY_SERVICE: Partial<Record<ExternalLinkService, string>> = {
    spotify: '#1DB954',
    appleMusic: '#FA243C',
    youtube: '#FF0033',
    youtubeMusic: '#FF0033',
    bandcamp: '#1DA0C3',
    soundcloud: '#FF5500',
    tidal: '#8BD3DD',
    deezer: '#A238FF',
    qobuz: '#F59E0B',
    amazonMusic: '#00A8E1',
    beatport: '#01FF95',
    discogs: '#F8FAFC',
    wikidata: '#7C3AED',
    wikipedia: '#8B949E',
    allMusic: '#4F8EF7',
    rateYourMusic: '#FACC15',
    lastFm: '#D51007',
    genius: '#FACC15',
    setlistFm: '#22C55E',
    songkick: '#F97316',
    bandsintown: '#00B4D8',
    instagram: '#E4405F',
    facebook: '#1877F2',
    myspace: '#F8FAFC',
    tumblr: '#8EA1B2',
    x: '#F8FAFC',
    tiktok: '#00F2EA',
    patreon: '#FF424D',
    linktree: '#43E660',
    official: '#38BDF8',
};

const CATEGORY_RANK: Record<ExternalLinkCategory, number> = {
    streaming: 0,
    official: 1,
    social: 2,
    store: 3,
    lyrics: 4,
    live: 5,
    database: 6,
    other: 7,
};

const SERVICE_RANK: Record<ExternalLinkService, number> = {
    spotify: 0,
    appleMusic: 1,
    youtubeMusic: 2,
    youtube: 3,
    soundcloud: 4,
    bandcamp: 5,
    tidal: 6,
    deezer: 7,
    amazonMusic: 8,
    qobuz: 9,
    beatport: 10,
    official: 11,
    linktree: 12,
    instagram: 13,
    tiktok: 14,
    x: 15,
    facebook: 16,
    myspace: 17,
    tumblr: 18,
    patreon: 19,
    genius: 30,
    songkick: 31,
    bandsintown: 32,
    setlistFm: 33,
    wikipedia: 40,
    discogs: 41,
    allMusic: 42,
    rateYourMusic: 43,
    lastFm: 44,
    wikidata: 45,
    other: 99,
};

const SERVICE_HOSTS: Record<ExternalLinkService, string[]> = {
    spotify: ['spotify.com'],
    appleMusic: ['music.apple.com', 'itunes.apple.com'],
    youtube: ['youtube.com', 'youtu.be'],
    youtubeMusic: ['music.youtube.com'],
    bandcamp: ['bandcamp.com'],
    soundcloud: ['soundcloud.com'],
    tidal: ['tidal.com'],
    deezer: ['deezer.com'],
    qobuz: ['qobuz.com'],
    amazonMusic: ['music.amazon.com'],
    beatport: ['beatport.com'],
    discogs: ['discogs.com'],
    wikidata: ['wikidata.org'],
    wikipedia: ['wikipedia.org'],
    allMusic: ['allmusic.com'],
    rateYourMusic: ['rateyourmusic.com'],
    lastFm: ['last.fm'],
    genius: ['genius.com'],
    setlistFm: ['setlist.fm'],
    songkick: ['songkick.com'],
    bandsintown: ['bandsintown.com'],
    instagram: ['instagram.com'],
    facebook: ['facebook.com', 'fb.com'],
    myspace: ['myspace.com'],
    tumblr: ['tumblr.com'],
    x: ['x.com', 'twitter.com'],
    tiktok: ['tiktok.com'],
    patreon: ['patreon.com'],
    linktree: ['linktr.ee', 'linktree.com'],
    official: [],
    other: [],
};

const SERVICE_HOST_MATCH_ORDER: ExternalLinkService[] = [
    'youtubeMusic',
    'appleMusic',
    'amazonMusic',
    'spotify',
    'youtube',
    'bandcamp',
    'soundcloud',
    'tidal',
    'deezer',
    'qobuz',
    'beatport',
    'discogs',
    'wikidata',
    'wikipedia',
    'allMusic',
    'rateYourMusic',
    'lastFm',
    'genius',
    'setlistFm',
    'songkick',
    'bandsintown',
    'instagram',
    'facebook',
    'myspace',
    'tumblr',
    'x',
    'tiktok',
    'patreon',
    'linktree',
];

const hostMatches = (hostname: string, service: ExternalLinkService): boolean => {
    return SERVICE_HOSTS[service].some(host => hostname === host || hostname.endsWith(`.${host}`));
};

const getHostname = (url: string): string => {
    try {
        return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return '';
    }
};

const knownCompoundTldPrefixes = new Set(['ac', 'co', 'com', 'edu', 'gov', 'net', 'org']);

const toTitleCase = (value: string): string => (
    value
        .split(/[\s._-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ')
);

const getDomainServiceLabel = (url: string): string | null => {
    const hostname = getHostname(url);
    if (!hostname) {
        return null;
    }

    const parts = hostname.split('.').filter(Boolean);
    if (parts.length === 0) {
        return null;
    }

    const servicePartIndex = parts.length >= 3 && knownCompoundTldPrefixes.has(parts[parts.length - 2] ?? '')
        ? parts.length - 3
        : Math.max(0, parts.length - 2);
    const servicePart = parts[servicePartIndex];

    return servicePart ? toTitleCase(servicePart) : null;
};

const normalizeLabel = (label: string): string => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const getResolvedService = (link: ExternalLink, normalizedUrl: string): ExternalLinkService => {
    if (link.service !== 'other') {
        return link.service;
    }

    if (link.icon !== 'other') {
        return link.icon;
    }

    const hostname = getHostname(normalizedUrl);
    const serviceFromHost = SERVICE_HOST_MATCH_ORDER.find(service => hostMatches(hostname, service));

    if (serviceFromHost) {
        return serviceFromHost;
    }

    const labelKey = normalizeLabel(link.label);
    if (labelKey === 'myspace') return 'myspace';
    if (labelKey === 'tumblr') return 'tumblr';
    if (labelKey === 'beatport') return 'beatport';
    if (labelKey === 'discogs') return 'discogs';
    if (labelKey === 'tidal') return 'tidal';

    return 'other';
};

const isFeaturedCandidate = (link: RankedExternalLink): boolean => {
    return STREAMING_SERVICES.has(link.resolvedService) ||
        PERSONAL_SERVICES.has(link.resolvedService) ||
        STREAMING_SERVICES.has(link.icon) ||
        PERSONAL_SERVICES.has(link.icon) ||
        link.category === 'streaming' ||
        link.category === 'official' ||
        link.category === 'social';
};

const getLinkRank = (link: ExternalLink, resolvedService: ExternalLinkService): number => {
    const serviceRank = SERVICE_RANK[resolvedService] ?? SERVICE_RANK[link.icon] ?? SERVICE_RANK.other;
    const categoryRank = getResolvedCategoryRank(link, resolvedService);

    return categoryRank * 100 + serviceRank;
};

const getResolvedCategoryRank = (link: ExternalLink, resolvedService: ExternalLinkService): number => {
    if (STREAMING_SERVICES.has(resolvedService)) {
        return CATEGORY_RANK.streaming;
    }

    if (resolvedService === 'official') {
        return CATEGORY_RANK.official;
    }

    if (PERSONAL_SERVICES.has(resolvedService)) {
        return CATEGORY_RANK.social;
    }

    return CATEGORY_RANK[link.category] ?? CATEGORY_RANK.other;
};

const getDisplayLabel = (link: ExternalLink, resolvedService: ExternalLinkService): string => {
    if (resolvedService !== 'other') {
        return SERVICE_LABELS[resolvedService];
    }

    const trimmedLabel = link.label.trim();
    const domainLabel = getDomainServiceLabel(link.url);

    return domainLabel ?? (trimmedLabel.length > 0 ? trimmedLabel : SERVICE_LABELS.other);
};

const getServiceColor = (service: ExternalLinkService): string | undefined => {
    if (service === 'x' || service === 'tidal' || service === 'discogs' || service === 'myspace') {
        return '#F8FAFC';
    }

    return COLOR_BY_SERVICE[service];
};

export const normalizeLinks = (links: ExternalLink[] | undefined): RankedExternalLink[] => {
    const seenUrls = new Set<string>();
    const normalizedLinks: RankedExternalLink[] = [];

    (links ?? []).forEach(link => {
        const normalizedUrl = typeof link.url === 'string' ? link.url.trim() : '';

        if (normalizedUrl.length === 0) {
            return;
        }

        const urlKey = normalizedUrl.toLowerCase();

        if (seenUrls.has(urlKey)) {
            return;
        }

        seenUrls.add(urlKey);
        const resolvedService = getResolvedService(link, normalizedUrl);

        normalizedLinks.push({
            ...link,
            normalizedUrl,
            resolvedService,
            displayLabel: getDisplayLabel(link, resolvedService),
            rank: getLinkRank(link, resolvedService),
        });
    });

    return normalizedLinks.sort((a, b) =>
        a.rank - b.rank ||
        a.displayLabel.localeCompare(b.displayLabel) ||
        a.normalizedUrl.localeCompare(b.normalizedUrl)
    );
};

export const getLinkKey = (link: RankedExternalLink): string => {
    return `${link.resolvedService}:${link.normalizedUrl}`;
};

export const splitLinks = (links: RankedExternalLink[], maxVisibleLinks = MAX_FEATURED_LINKS): {
    visibleLinks: RankedExternalLink[];
    overflowLinks: RankedExternalLink[];
} => {
    const visibleLinkLimit = Math.max(0, Math.min(maxVisibleLinks, links.length));
    const featuredServiceKeys = new Set<ExternalLinkService>();
    const featuredLinks: RankedExternalLink[] = [];

    links.forEach(link => {
        if (featuredLinks.length >= visibleLinkLimit || !isFeaturedCandidate(link)) {
            return;
        }

        if (featuredServiceKeys.has(link.resolvedService)) {
            return;
        }

        featuredServiceKeys.add(link.resolvedService);
        featuredLinks.push(link);
    });

    const visibleLinks = featuredLinks.length > 0
        ? featuredLinks
        : links.slice(0, visibleLinkLimit);

    if (visibleLinks.length < visibleLinkLimit) {
        const visibleUrlKeys = new Set(visibleLinks.map(link => link.normalizedUrl.toLowerCase()));

        links.forEach(link => {
            if (visibleLinks.length >= visibleLinkLimit) {
                return;
            }

            const urlKey = link.normalizedUrl.toLowerCase();

            if (visibleUrlKeys.has(urlKey)) {
                return;
            }

            visibleUrlKeys.add(urlKey);
            visibleLinks.push(link);
        });
    }

    const visibleUrlKeys = new Set(visibleLinks.map(link => link.normalizedUrl.toLowerCase()));
    const overflowLinks = links.filter(link => !visibleUrlKeys.has(link.normalizedUrl.toLowerCase()));

    return {
        visibleLinks,
        overflowLinks,
    };
};

export const getExternalLinkIconConfig = (link: RankedExternalLink): ExternalLinkIconConfig => {
    const iconService = link.icon !== 'other' && ICON_BY_SERVICE[link.icon] ? link.icon : link.resolvedService;
    return ICON_BY_SERVICE[iconService] ?? ICON_BY_SERVICE.other;
};

export const getExternalLinkColor = (
    link: RankedExternalLink,
    fallbackColor: string,
): string => {
    return getServiceColor(link.icon) ??
        getServiceColor(link.resolvedService) ??
        fallbackColor;
};

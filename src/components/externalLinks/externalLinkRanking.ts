import type { ExternalLink, ExternalLinkService } from '../../shared/music';
import {
    STREAMING_SERVICES,
    PERSONAL_SERVICES,
    SERVICE_LABELS,
    ICON_BY_SERVICE,
    COLOR_BY_SERVICE,
    CATEGORY_RANK,
    SERVICE_RANK,
    SERVICE_HOSTS,
    SERVICE_HOST_MATCH_ORDER,
    MAX_FEATURED_LINKS,
    type ExternalLinkIconConfig,
} from './externalLinkConstants';

export type { ExternalLinkIconConfig };

export type RankedExternalLink = ExternalLink & {
    normalizedUrl: string;
    resolvedService: ExternalLinkService;
    displayLabel: string;
    rank: number;
};

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

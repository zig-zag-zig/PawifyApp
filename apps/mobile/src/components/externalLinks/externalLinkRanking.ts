import type { ExternalLink, ExternalLinkService } from '@pawify/shared';
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

export type ExternalLinkSectionKey = 'listen' | 'follow' | 'more';

export interface ExternalLinkSection {
    key: ExternalLinkSectionKey;
    title: string;
    links: RankedExternalLink[];
}

export const EXTERNAL_LINK_SECTION_TITLES: Record<ExternalLinkSectionKey, string> = {
    listen: 'Listen on',
    follow: 'Follow',
    more: 'More',
};

const SECTION_ORDER: ExternalLinkSectionKey[] = ['listen', 'follow', 'more'];

const getSectionKey = (link: RankedExternalLink): ExternalLinkSectionKey => {
    if (STREAMING_SERVICES.has(link.resolvedService) || STREAMING_SERVICES.has(link.icon)) {
        return 'listen';
    }

    if (
        link.resolvedService === 'official' ||
        PERSONAL_SERVICES.has(link.resolvedService) ||
        PERSONAL_SERVICES.has(link.icon)
    ) {
        return 'follow';
    }

    return 'more';
};

/**
 * Splits ranked links into display sections: streaming services first, then
 * artist/profile links, then everything else. The caller's preferred streaming
 * service (if any) is pulled to the front of the "Listen on" section so the
 * user's service is the first tile — this replaces the old single-service
 * "Listen on X" pill, which duplicated the grid below it.
 */
export const groupLinksBySection = (
    links: RankedExternalLink[],
    preferredService: ExternalLinkService | null = null,
): ExternalLinkSection[] => {
    const buckets: Record<ExternalLinkSectionKey, RankedExternalLink[]> = {
        listen: [],
        follow: [],
        more: [],
    };

    links.forEach(link => {
        buckets[getSectionKey(link)].push(link);
    });

    if (preferredService !== null && buckets.listen.length > 1) {
        // Stable sort keeps the existing rank order within each group.
        buckets.listen = [...buckets.listen].sort((a, b) => {
            const aPreferred = a.resolvedService === preferredService ? 0 : 1;
            const bPreferred = b.resolvedService === preferredService ? 0 : 1;
            return aPreferred - bPreferred;
        });
    }

    return SECTION_ORDER
        .map(key => ({ key, title: EXTERNAL_LINK_SECTION_TITLES[key], links: buckets[key] }))
        .filter(section => section.links.length > 0);
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

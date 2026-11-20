import type { ExternalLink } from '@pawify/shared';

export type ProviderUrls = {
    deezerUrls: string[];
    tidalUrls: string[];
};

export const EMPTY_PROVIDER_URLS: ProviderUrls = { deezerUrls: [], tidalUrls: [] };

const DEEZER_HOST = 'deezer.com/';
const TIDAL_HOST = 'tidal.com/';

const bucketForUrl = (url: string): 'deezer' | 'tidal' | null => {
    const lower = url.toLowerCase();
    if (lower.includes(DEEZER_HOST)) return 'deezer';
    if (lower.includes(TIDAL_HOST)) return 'tidal';
    return null;
};

/**
 * Deezer/Tidal album links from already-stored external links.
 *
 * Artwork provider discovery reads local `external_links` only. MusicBrainz
 * metadata lookup is not an artwork fallback; when no local provider link exists,
 * the chain continues to Cover Art Archive and then a placeholder.
 */
export const providerUrlsFromLinks = (
    links: readonly Pick<ExternalLink, 'service' | 'url'>[] | undefined,
): ProviderUrls => {
    const deezerUrls: string[] = [];
    const tidalUrls: string[] = [];

    for (const link of links ?? []) {
        const bucket =
            link.service === 'deezer' || link.service === 'tidal'
                ? link.service
                : bucketForUrl(link.url);
        if (bucket === 'deezer' && !deezerUrls.includes(link.url)) {
            deezerUrls.push(link.url);
        }
        if (bucket === 'tidal' && !tidalUrls.includes(link.url)) {
            tidalUrls.push(link.url);
        }
    }

    return { deezerUrls, tidalUrls };
};

import { describe, expect, it } from 'vitest';
import type { ExternalLink, ExternalLinkCategory, ExternalLinkService } from '../../shared/music';
import { normalizeLinks, splitLinks } from './externalLinkRanking';

function externalLink(
    service: ExternalLinkService,
    category: ExternalLinkCategory,
): ExternalLink {
    return {
        service,
        label: service,
        url: `https://example.com/${service}`,
        icon: service,
        category,
    };
}

describe('external link ranking', () => {
    it('fills the collapsed grid after featured links so the chevron can end the second row', () => {
        const links = normalizeLinks([
            externalLink('spotify', 'streaming'),
            externalLink('tidal', 'streaming'),
            externalLink('deezer', 'streaming'),
            externalLink('official', 'official'),
            externalLink('x', 'social'),
            externalLink('discogs', 'database'),
            externalLink('allMusic', 'database'),
            externalLink('rateYourMusic', 'database'),
            externalLink('wikidata', 'database'),
        ]);

        const { visibleLinks, overflowLinks } = splitLinks(links, 7);

        expect(visibleLinks.map(link => link.resolvedService)).toEqual([
            'spotify',
            'tidal',
            'deezer',
            'official',
            'x',
            'discogs',
            'allMusic',
        ]);
        expect(overflowLinks.map(link => link.resolvedService)).toEqual([
            'rateYourMusic',
            'wikidata',
        ]);
    });
});

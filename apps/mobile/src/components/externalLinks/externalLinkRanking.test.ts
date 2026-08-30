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
    describe('normalizeLinks', () => {
        it('returns empty array for undefined input', () => {
            expect(normalizeLinks(undefined)).toEqual([]);
        });

        it('returns empty array for empty input', () => {
            expect(normalizeLinks([])).toEqual([]);
        });

        it('deduplicates by URL', () => {
            const links = normalizeLinks([
                externalLink('spotify', 'streaming'),
                { ...externalLink('spotify', 'streaming'), label: 'dup' },
            ]);
            expect(links).toHaveLength(1);
        });
    });

    describe('splitLinks', () => {
        it('returns empty visible and overflow for empty links', () => {
            const { visibleLinks, overflowLinks } = splitLinks([], 7);
            expect(visibleLinks).toEqual([]);
            expect(overflowLinks).toEqual([]);
        });

        it('puts all links in visible when fewer than max', () => {
            const links = normalizeLinks([
                externalLink('spotify', 'streaming'),
                externalLink('official', 'official'),
            ]);
            const { visibleLinks, overflowLinks } = splitLinks(links, 5);
            expect(visibleLinks).toHaveLength(2);
            expect(overflowLinks).toHaveLength(0);
        });

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
});

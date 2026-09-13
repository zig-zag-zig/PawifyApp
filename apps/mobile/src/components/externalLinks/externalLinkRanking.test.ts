import { describe, expect, it } from 'vitest';
import type { ExternalLink, ExternalLinkCategory, ExternalLinkService } from '@pawify/shared';
import { groupLinksBySection, normalizeLinks } from './externalLinkRanking';

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

    describe('groupLinksBySection', () => {
        const servicesOf = (links: { resolvedService: string }[]) =>
            links.map(link => link.resolvedService);

        it('returns no sections for empty input', () => {
            expect(groupLinksBySection([])).toEqual([]);
        });

        it('splits streaming, profile and other links into ordered sections', () => {
            const sections = groupLinksBySection(
                normalizeLinks([
                    externalLink('discogs', 'database'),
                    externalLink('spotify', 'streaming'),
                    externalLink('instagram', 'social'),
                    externalLink('appleMusic', 'streaming'),
                ]),
            );

            expect(sections.map(section => section.key)).toEqual(['listen', 'follow', 'more']);
            expect(sections.map(section => section.title)).toEqual(['Listen on', 'Follow', 'More']);
            expect(servicesOf(sections[0].links)).toEqual(['spotify', 'appleMusic']);
            expect(servicesOf(sections[1].links)).toEqual(['instagram']);
            expect(servicesOf(sections[2].links)).toEqual(['discogs']);
        });

        it('omits empty sections', () => {
            const sections = groupLinksBySection(
                normalizeLinks([externalLink('spotify', 'streaming')]),
            );

            expect(sections).toHaveLength(1);
            expect(sections[0].key).toBe('listen');
        });

        it('moves the preferred streaming service to the front of the listen section', () => {
            const sections = groupLinksBySection(
                normalizeLinks([
                    externalLink('spotify', 'streaming'),
                    externalLink('appleMusic', 'streaming'),
                    externalLink('deezer', 'streaming'),
                ]),
                'deezer',
            );

            expect(servicesOf(sections[0].links)).toEqual(['deezer', 'spotify', 'appleMusic']);
        });

        it('keeps rank order when no preference is set', () => {
            const sections = groupLinksBySection(
                normalizeLinks([
                    externalLink('deezer', 'streaming'),
                    externalLink('spotify', 'streaming'),
                ]),
                null,
            );

            expect(servicesOf(sections[0].links)).toEqual(['spotify', 'deezer']);
        });
    });
});

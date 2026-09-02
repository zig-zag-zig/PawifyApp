import { describe, expect, it } from 'vitest';

import { parseMarkdownBlocks, parseMarkdownInline } from './markdown';

describe('parseMarkdownBlocks', () => {
    it('parses headings, bullets, rules and paragraphs', () => {
        const blocks = parseMarkdownBlocks(
            [
                '## Meowsic-style release',
                '',
                'Intro paragraph.',
                '',
                '### Features',
                '',
                '- First thing',
                '- Second thing',
                '',
                '---',
                '',
                'Done.',
            ].join('\n'),
        );

        expect(blocks).toEqual([
            { type: 'heading', level: 2, text: 'Meowsic-style release' },
            { type: 'paragraph', text: 'Intro paragraph.' },
            { type: 'heading', level: 3, text: 'Features' },
            { type: 'bullet', marker: '•', text: 'First thing' },
            { type: 'bullet', marker: '•', text: 'Second thing' },
            { type: 'rule' },
            { type: 'paragraph', text: 'Done.' },
        ]);
    });

    it('parses ordered lists as numbered markers', () => {
        expect(parseMarkdownBlocks('1. one\n2. two')).toEqual([
            { type: 'bullet', marker: '1.', text: 'one' },
            { type: 'bullet', marker: '2.', text: 'two' },
        ]);
    });

    it('parses fenced code blocks', () => {
        expect(parseMarkdownBlocks('before\n```kotlin\nval a = 1\n```\nafter')).toEqual([
            { type: 'paragraph', text: 'before' },
            { type: 'codeBlock', lines: ['val a = 1'] },
            { type: 'paragraph', text: 'after' },
        ]);
    });

    it('joins consecutive lines into one paragraph', () => {
        expect(parseMarkdownBlocks('line one\nline two')).toEqual([
            { type: 'paragraph', text: 'line one\nline two' },
        ]);
    });

    it('handles blank and degenerate input', () => {
        expect(parseMarkdownBlocks('')).toEqual([]);
        expect(parseMarkdownBlocks('   \n  \n')).toEqual([]);
    });
});

describe('parseMarkdownInline', () => {
    it('keeps plain text as a single token', () => {
        expect(parseMarkdownInline('just text')).toEqual([{ type: 'text', text: 'just text' }]);
    });

    it('styles bold, italic and inline code', () => {
        expect(parseMarkdownInline('a **bold** and *italic* and `code` mix')).toEqual([
            { type: 'text', text: 'a ' },
            { type: 'bold', text: 'bold' },
            { type: 'text', text: ' and ' },
            { type: 'italic', text: 'italic' },
            { type: 'text', text: ' and ' },
            { type: 'code', text: 'code' },
            { type: 'text', text: ' mix' },
        ]);
    });

    it('detects labelled and bare links', () => {
        const tokens = parseMarkdownInline('see [notes](https://example.com/a) and https://example.com/b.');
        const links = tokens.filter((token) => token.type === 'link');
        expect(links).toEqual([
            { type: 'link', text: 'notes', url: 'https://example.com/a' },
            { type: 'link', text: 'https://example.com/b', url: 'https://example.com/b' },
        ]);
    });

    it('degrades gracefully for unmatched markers', () => {
        expect(parseMarkdownInline('a * lone star')).toEqual([{ type: 'text', text: 'a * lone star' }]);
    });
});

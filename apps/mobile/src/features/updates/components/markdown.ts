/**
 * Lightweight markdown parser for release notes. Supports the subset GitHub
 * release bodies actually use: ## / ### headings, bullet lists (- or *), ordered
 * lists (1.), bold, italics, inline code, fenced code blocks, [label](url)
 * links, bare URLs, horizontal rules (---) and plain paragraphs. Everything
 * else degrades to plain text instead of leaking markdown symbols.
 *
 * Pure data output (no React Native imports) so it is unit-testable in node.
 */

export type MarkdownInline =
    | { type: 'text'; text: string }
    | { type: 'bold'; text: string }
    | { type: 'italic'; text: string }
    | { type: 'code'; text: string }
    | { type: 'link'; text: string; url: string };

export type MarkdownBlock =
    | { type: 'heading'; level: 1 | 2 | 3; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'bullet'; marker: string; text: string }
    | { type: 'codeBlock'; lines: string[] }
    | { type: 'rule' };

const RULE_PATTERN = /^(-{3,}|\*{3,}|_{3,})$/;
const BULLET_PATTERN = /^[-*]\s+(.*)$/;
const ORDERED_PATTERN = /^(\d+)\.\s+(.*)$/;

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = [];
    const lines = markdown.split('\n');
    const paragraph: string[] = [];

    const flushParagraph = () => {
        const text = paragraph.join('\n').trim();
        if (text.length > 0) {
            blocks.push({ type: 'paragraph', text });
        }
        paragraph.length = 0;
    };

    let index = 0;
    while (index < lines.length) {
        const line = lines[index].trim();

        if (line.length === 0) {
            flushParagraph();
            index += 1;
            continue;
        }

        if (line.startsWith('```')) {
            flushParagraph();
            const codeLines: string[] = [];
            index += 1;
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                codeLines.push(lines[index]);
                index += 1;
            }
            index += 1; // consume the closing fence (or end of input)
            blocks.push({ type: 'codeBlock', lines: codeLines });
            continue;
        }

        const heading = /^(#{1,3})\s+(.*)$/.exec(line);
        if (heading) {
            flushParagraph();
            const level = heading[1].length as 1 | 2 | 3;
            const text = heading[2].trim();
            if (text.length > 0) {
                blocks.push({ type: 'heading', level, text });
            }
            index += 1;
            continue;
        }

        if (RULE_PATTERN.test(line)) {
            flushParagraph();
            blocks.push({ type: 'rule' });
            index += 1;
            continue;
        }

        const bullet = BULLET_PATTERN.exec(line);
        if (bullet) {
            flushParagraph();
            blocks.push({ type: 'bullet', marker: '•', text: bullet[1].trim() });
            index += 1;
            continue;
        }

        const ordered = ORDERED_PATTERN.exec(line);
        if (ordered) {
            flushParagraph();
            blocks.push({ type: 'bullet', marker: `${ordered[1]}.`, text: ordered[2].trim() });
            index += 1;
            continue;
        }

        paragraph.push(line);
        index += 1;
    }

    flushParagraph();
    return blocks;
}

const LABELLED_LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)/;
const BARE_URL_PATTERN = /^https?:\/\/[^\s)]+/;

export function parseMarkdownInline(text: string): MarkdownInline[] {
    const tokens: MarkdownInline[] = [];
    let cursor = 0;

    while (cursor < text.length) {
        const remaining = text.slice(cursor);

        if (remaining.startsWith('**')) {
            const end = text.indexOf('**', cursor + 2);
            if (end > cursor + 1) {
                tokens.push({ type: 'bold', text: text.slice(cursor + 2, end) });
                cursor = end + 2;
                continue;
            }
        }

        if (remaining.startsWith('*')) {
            const end = text.indexOf('*', cursor + 1);
            const inner = end > cursor + 1 ? text.slice(cursor + 1, end) : '';
            if (inner.trim().length > 0) {
                tokens.push({ type: 'italic', text: inner });
                cursor = end + 1;
                continue;
            }
        }

        if (remaining.startsWith('`')) {
            const end = text.indexOf('`', cursor + 1);
            if (end > cursor + 1) {
                tokens.push({ type: 'code', text: text.slice(cursor + 1, end) });
                cursor = end + 1;
                continue;
            }
        }

        if (remaining.startsWith('[')) {
            const link = LABELLED_LINK_PATTERN.exec(remaining);
            if (link) {
                tokens.push({ type: 'link', text: link[1], url: link[2] });
                cursor += link[0].length;
                continue;
            }
        }

        const bare = BARE_URL_PATTERN.exec(remaining);
        if (bare) {
            const url = bare[0].replace(/[.,;]+$/, '');
            tokens.push({ type: 'link', text: url, url });
            cursor += url.length;
            continue;
        }

        // Plain run: consume until the next markdown-ish character or URL start.
        let next = cursor + 1;
        while (next < text.length) {
            const probe = text[next];
            if (
                probe === '*' ||
                probe === '`' ||
                probe === '[' ||
                text.slice(next).startsWith('http://') ||
                text.slice(next).startsWith('https://')
            ) {
                break;
            }
            next += 1;
        }
        const run = text.slice(cursor, next);
        const previous = tokens[tokens.length - 1];
        if (previous && previous.type === 'text') {
            previous.text += run;
        } else {
            tokens.push({ type: 'text', text: run });
        }
        cursor = next;
    }

    return tokens;
}

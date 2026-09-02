import React, { useMemo } from 'react';
import { Linking, Text, View } from 'react-native';

import { appUpdateModalStyles as styles } from './appUpdateModalStyles';
import { parseMarkdownBlocks, parseMarkdownInline, type MarkdownInline } from './markdown';

type MarkdownTextProps = {
    markdown: string;
};

function renderInline(tokens: MarkdownInline[]): React.ReactNode {
    return tokens.map((token, index) => {
        switch (token.type) {
            case 'bold':
                return (
                    <Text key={index} style={styles.markdownBold}>
                        {token.text}
                    </Text>
                );
            case 'italic':
                return (
                    <Text key={index} style={styles.markdownItalic}>
                        {token.text}
                    </Text>
                );
            case 'code':
                return (
                    <Text key={index} style={styles.markdownCode}>
                        {token.text}
                    </Text>
                );
            case 'link':
                return (
                    <Text
                        key={index}
                        style={styles.markdownLink}
                        onPress={() => Linking.openURL(token.url)}
                    >
                        {token.text}
                    </Text>
                );
            default:
                return <React.Fragment key={index}>{token.text}</React.Fragment>;
        }
    });
}

/**
 * Renders curated markdown (GitHub release bodies) with native nested Text
 * styling: headings, bullets, bold, italics, inline code, fenced code blocks,
 * rules and tappable links. Unrecognized markdown degrades to plain text.
 */
export function MarkdownText({ markdown }: MarkdownTextProps) {
    const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);

    return (
        <View style={styles.markdownContainer}>
            {blocks.map((block, index) => {
                switch (block.type) {
                    case 'heading':
                        return (
                            <Text
                                key={index}
                                style={block.level === 1 ? styles.markdownHeading : styles.markdownSubheading}
                            >
                                {block.text}
                            </Text>
                        );
                    case 'paragraph':
                        return (
                            <Text key={index} style={styles.markdownBody}>
                                {renderInline(parseMarkdownInline(block.text))}
                            </Text>
                        );
                    case 'bullet':
                        return (
                            <View key={index} style={styles.markdownBulletRow}>
                                <Text style={styles.markdownBulletMarker}>{block.marker}</Text>
                                <Text style={styles.markdownBody}>
                                    {renderInline(parseMarkdownInline(block.text))}
                                </Text>
                            </View>
                        );
                    case 'codeBlock':
                        return (
                            <View key={index} style={styles.markdownCodeBlock}>
                                <Text style={styles.markdownCodeBlockText}>
                                    {block.lines.join('\n')}
                                </Text>
                            </View>
                        );
                    case 'rule':
                        return <View key={index} style={styles.markdownRule} />;
                    default:
                        return null;
                }
            })}
        </View>
    );
}

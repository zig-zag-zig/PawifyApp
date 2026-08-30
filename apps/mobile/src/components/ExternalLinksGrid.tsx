import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import type { ExternalLink } from '@pawify/shared';
import { openExternalUrl } from '../services/externalNavigation';
import { theme } from '../styles/theme';
import { ExternalLinkIcon } from './externalLinks/ExternalLinkIcon';
import {
    EXTERNAL_LINK_BUTTON_WIDTH,
    EXTERNAL_LINK_GRID_GAP,
    EXTERNAL_LINK_GRID_HORIZONTAL_PADDING,
    styles,
} from './externalLinks/externalLinksGridStyles';
import {
    getExternalLinkColor,
    getExternalLinkIconConfig,
    getLinkKey,
    normalizeLinks,
    splitLinks,
    type RankedExternalLink,
} from './externalLinks/externalLinkRanking';

interface ExternalLinksGridProps {
    links?: ExternalLink[];
}

interface AutoScrollingLinkLabelProps {
    compact: boolean;
    color: string;
    label: string;
}

const SCROLL_PIXELS_PER_SECOND = 12;
const SCROLL_LABEL_GAP = 28;
const DEFAULT_COLUMN_COUNT = 4;

function getColumnCount(gridWidth: number): number {
    if (gridWidth <= 0) {
        return DEFAULT_COLUMN_COUNT;
    }

    const availableWidth = Math.max(
        0,
        gridWidth - (EXTERNAL_LINK_GRID_HORIZONTAL_PADDING * 2),
    );

    return Math.max(
        1,
        Math.floor(
            (availableWidth + EXTERNAL_LINK_GRID_GAP) /
            (EXTERNAL_LINK_BUTTON_WIDTH + EXTERNAL_LINK_GRID_GAP),
        ),
    );
}

function chunkRows<T>(items: T[], columnCount: number): T[][] {
    const rows: T[][] = [];

    for (let index = 0; index < items.length; index += columnCount) {
        rows.push(items.slice(index, index + columnCount));
    }

    return rows;
}

const AutoScrollingLinkLabel = ({ compact, color, label }: AutoScrollingLinkLabelProps) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const [containerWidth, setContainerWidth] = useState(0);
    const [textWidth, setTextWidth] = useState(0);

    const shouldScroll = containerWidth > 0 && textWidth > containerWidth + 1;
    const scrollDistance = textWidth + SCROLL_LABEL_GAP;

    useEffect(() => {
        setTextWidth(0);
        translateX.setValue(0);
    }, [label, translateX]);

    useEffect(() => {
        translateX.stopAnimation();
        translateX.setValue(0);

        if (!shouldScroll || scrollDistance <= 0) {
            return;
        }

        const scrollDurationMs = Math.max(
            4500,
            Math.round((scrollDistance / SCROLL_PIXELS_PER_SECOND) * 1000),
        );

        const animation = Animated.loop(
            Animated.timing(translateX, {
                toValue: -scrollDistance,
                duration: scrollDurationMs,
                easing: Easing.linear,
                useNativeDriver: true,
                isInteraction: false,
            }),
            { resetBeforeIteration: true },
        );

        const startTimeout = setTimeout(() => animation.start(), 800);

        return () => {
            clearTimeout(startTimeout);
            animation.stop();
            translateX.setValue(0);
        };
    }, [label, scrollDistance, shouldScroll, translateX]);

    return (
        <View
            style={styles.linkLabelViewport}
            onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
        >
            <Text
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                numberOfLines={1}
                onTextLayout={event => {
                    const measuredWidth = Math.max(
                        0,
                        ...event.nativeEvent.lines.map(line => line.width),
                    );
                    if (measuredWidth > 0) {
                        setTextWidth(measuredWidth);
                    }
                }}
                style={[
                    styles.linkLabel,
                    compact && styles.compactLinkLabel,
                    styles.measureLinkLabel,
                ]}
            >
                {label}
            </Text>
            {shouldScroll ? (
                <Animated.View
                    style={[
                        styles.scrollingLinkLabelTrack,
                        { transform: [{ translateX }] },
                    ]}
                >
                    {[0, 1].map(index => (
                        <Text
                            key={`${label}-${index}`}
                            ellipsizeMode="clip"
                            numberOfLines={1}
                            style={[
                                styles.linkLabel,
                                compact && styles.compactLinkLabel,
                                styles.scrollingLinkLabel,
                                index === 1 && { marginLeft: SCROLL_LABEL_GAP },
                                { color, width: textWidth },
                            ]}
                        >
                            {label}
                        </Text>
                    ))}
                </Animated.View>
            ) : (
                <Text
                    ellipsizeMode="clip"
                    numberOfLines={1}
                    style={[
                        styles.linkLabel,
                        compact && styles.compactLinkLabel,
                        styles.staticLinkLabel,
                        { color },
                    ]}
                >
                    {label}
                </Text>
            )}
        </View>
    );
};

const ExternalLinksGrid = ({ links }: ExternalLinksGridProps) => {
    const [showOverflowLinks, setShowOverflowLinks] = useState(false);
    const [gridWidth, setGridWidth] = useState(0);

    const openingUrlRef = useRef<string | null>(null);

    const normalizedLinks = useMemo(
        () => normalizeLinks(links),
        [links]
    );
    const columnCount = useMemo(
        () => getColumnCount(gridWidth),
        [gridWidth]
    );
    const collapsedCapacity = columnCount * 2;
    const shouldCollapseLinks = normalizedLinks.length > collapsedCapacity;
    const visibleLinkLimit = shouldCollapseLinks
        ? Math.max(1, collapsedCapacity - 1)
        : normalizedLinks.length;
    const { visibleLinks, overflowLinks } = useMemo(
        () => splitLinks(normalizedLinks, visibleLinkLimit),
        [normalizedLinks, visibleLinkLimit]
    );

    const handleGridLayout = useCallback((event: LayoutChangeEvent) => {
        const nextWidth = event.nativeEvent.layout.width;

        setGridWidth(currentWidth => (
            Math.abs(currentWidth - nextWidth) > 0.5 ? nextWidth : currentWidth
        ));
    }, []);

    const openExternalLink = useCallback((link: RankedExternalLink): void => {
        if (openingUrlRef.current === link.normalizedUrl) {
            return;
        }

        openingUrlRef.current = link.normalizedUrl;

        void openExternalUrl(link.normalizedUrl)
            .catch(error => {
                console.warn('external-links: failed to open url', {
                    url: link.normalizedUrl,
                    error,
                });
            })
            .finally(() => {
                setTimeout(() => {
                    if (openingUrlRef.current === link.normalizedUrl) {
                        openingUrlRef.current = null;
                    }
                }, 600);
            });
    }, []);

    if (visibleLinks.length === 0) {
        return null;
    }

    const { border: borderColor, background: backgroundColor, mutedBackground: mutedBackgroundColor, label: labelColor, fallbackIcon: fallbackColor, overflowToggle: overflowButtonTextColor } = theme.colors.externalLinks;

    const renderLinkButton = (link: RankedExternalLink, compact = false) => {
        const linkKey = getLinkKey(link);
        const iconConfig = getExternalLinkIconConfig(link);
        const iconColor = getExternalLinkColor(link, fallbackColor);

        return (
            <Pressable
                key={linkKey}
                onPress={() => openExternalLink(link)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${link.displayLabel}`}
                style={[
                    styles.linkButton,
                    compact && styles.compactLinkButton,
                    {
                        backgroundColor: compact ? mutedBackgroundColor : backgroundColor,
                        borderColor,
                    },
                ]}
            >
                <View style={styles.iconBox}>
                    <ExternalLinkIcon icon={iconConfig} color={iconColor} size={compact ? 18 : 20} />
                </View>

                <AutoScrollingLinkLabel
                    compact={compact}
                    color={labelColor}
                    label={link.displayLabel}
                />
            </Pressable>
        );
    };

    const renderOverflowToggle = () => (
        <Pressable
            key="external-links-overflow-toggle"
            onPress={() => setShowOverflowLinks(value => !value)}
            accessibilityRole="button"
            accessibilityLabel={showOverflowLinks ? 'Hide additional links' : `Show ${overflowLinks.length} additional links`}
            accessibilityState={{ expanded: showOverflowLinks }}
            style={[
                styles.moreChip,
            ]}
        >
            <MaterialCommunityIcons
                name={showOverflowLinks ? 'chevron-up' : 'chevron-down'}
                size={24}
                color={overflowButtonTextColor}
            />
        </Pressable>
    );

    const renderRows = (children: React.ReactNode[], keyPrefix: string) => (
        chunkRows(children, columnCount).map((rowChildren, rowIndex) => {
            const placeholderCount = Math.max(0, columnCount - rowChildren.length);

            return (
                <View key={`${keyPrefix}-row-${rowIndex}`} style={styles.gridRow}>
                    {rowChildren}
                    {Array.from({ length: placeholderCount }).map((_, placeholderIndex) => (
                        <View
                            key={`${keyPrefix}-row-${rowIndex}-placeholder-${placeholderIndex}`}
                            style={styles.gridPlaceholder}
                            pointerEvents="none"
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                        />
                    ))}
                </View>
            );
        })
    );

    const collapsedItems = [
        ...visibleLinks.map(link => renderLinkButton(link)),
        ...(overflowLinks.length > 0 ? [renderOverflowToggle()] : []),
    ];

    return (
        <View style={styles.container}>
            <View style={styles.grid} onLayout={handleGridLayout}>
                {renderRows(collapsedItems, 'external-links-visible')}
            </View>

            {showOverflowLinks && (
                <View style={[styles.grid, styles.overflowGrid]}>
                    {renderRows(
                        overflowLinks.map(link => renderLinkButton(link, true)),
                        'external-links-overflow'
                    )}
                </View>
            )}
        </View>
    );
};

export default React.memo(ExternalLinksGrid);

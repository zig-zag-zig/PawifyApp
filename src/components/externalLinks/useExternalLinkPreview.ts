import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
    getLinkKey,
    type RankedExternalLink,
} from './externalLinkRanking';

export type GridGroup = 'visible' | 'overflow';

type LinkLayout = {
    group: GridGroup;
    x: number;
    y: number;
    width: number;
    height: number;
};

type ExternalLinkPreviewOptions = {
    visibleLinks: RankedExternalLink[];
    overflowLinks: RankedExternalLink[];
};

const previewDurationMs = 4500;

export function useExternalLinkPreview({
    visibleLinks,
    overflowLinks,
}: ExternalLinkPreviewOptions) {
    const [previewedLinkKey, setPreviewedLinkKey] = useState<string | null>(null);
    const [bannerTop, setBannerTop] = useState<number | null>(null);
    const [bannerLeft, setBannerLeft] = useState<number | null>(null);
    const [bannerWidth, setBannerWidth] = useState<number | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [gridLayoutByGroup, setGridLayoutByGroup] = useState<Record<GridGroup, { x: number; y: number }>>({
        visible: { x: 0, y: 0 },
        overflow: { x: 0, y: 0 },
    });

    const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const linkLayoutsRef = useRef<Record<string, LinkLayout>>({});

    const previewedLink = useMemo(() => {
        if (!previewedLinkKey) {
            return null;
        }

        return [...visibleLinks, ...overflowLinks].find(link => getLinkKey(link) === previewedLinkKey) ?? null;
    }, [previewedLinkKey, visibleLinks, overflowLinks]);

    const safeBannerTop = Number.isFinite(bannerTop) ? bannerTop : null;

    const clearPreviewTimer = useCallback(() => {
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
            previewTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => clearPreviewTimer, [clearPreviewTimer]);

    const clearPreview = useCallback(() => {
        setPreviewedLinkKey(null);
        setBannerTop(null);
        setBannerLeft(null);
        setBannerWidth(null);
        clearPreviewTimer();
    }, [clearPreviewTimer]);

    const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;

        setContainerSize(current => {
            if (current.width === width && current.height === height) {
                return current;
            }

            return { width, height };
        });
    }, []);

    const handleGridLayout = useCallback((group: GridGroup, event: LayoutChangeEvent) => {
        const { x, y } = event.nativeEvent.layout;

        setGridLayoutByGroup(current => {
            if (current[group].x === x && current[group].y === y) {
                return current;
            }

            return {
                ...current,
                [group]: { x, y },
            };
        });
    }, []);

    const handleLinkLayout = useCallback((linkKey: string, group: GridGroup, event: LayoutChangeEvent) => {
        const { x, y, width, height } = event.nativeEvent.layout;

        linkLayoutsRef.current[linkKey] = {
            group,
            x,
            y,
            width,
            height,
        };
    }, []);

    const showExternalLinkPreview = useCallback((link: RankedExternalLink) => {
        const linkKey = getLinkKey(link);

        clearPreviewTimer();

        const linkLayout = linkLayoutsRef.current[linkKey];
        const horizontalMargin = 4;
        const maxPreferredBannerWidth = 220;

        setPreviewedLinkKey(linkKey);

        if (
            linkLayout &&
            Number.isFinite(containerSize.width) &&
            Number.isFinite(containerSize.height) &&
            containerSize.width > 0
        ) {
            const gridLayout = gridLayoutByGroup[linkLayout.group] ?? { x: 0, y: 0 };

            const iconTop = gridLayout.y + linkLayout.y;
            const iconLeft = gridLayout.x + linkLayout.x;
            const preferredWidth = Math.min(
                maxPreferredBannerWidth,
                Math.max(
                    linkLayout.width,
                    Math.min(
                        Math.ceil(link.displayLabel.length * 8.4) + 24,
                        containerSize.width - horizontalMargin * 2
                    )
                )
            );
            const canAlignLeft = iconLeft + preferredWidth <= containerSize.width - horizontalMargin;
            const rightAlignedLeft = iconLeft + linkLayout.width - preferredWidth;
            const canAlignRight = rightAlignedLeft >= horizontalMargin;
            const nextWidth = canAlignLeft || canAlignRight ? preferredWidth : linkLayout.width;
            const nextLeft = canAlignLeft
                ? iconLeft
                : canAlignRight
                    ? rightAlignedLeft
                    : Math.max(horizontalMargin, Math.min(iconLeft, containerSize.width - nextWidth - horizontalMargin));

            setBannerTop(Number.isFinite(iconTop) ? iconTop : 0);
            setBannerLeft(Number.isFinite(nextLeft) ? nextLeft : horizontalMargin);
            setBannerWidth(Number.isFinite(nextWidth) ? nextWidth : linkLayout.width);
        } else {
            setBannerTop(0);
            setBannerLeft(horizontalMargin);
            setBannerWidth(74);
        }

        previewTimeoutRef.current = setTimeout(() => {
            setPreviewedLinkKey(null);
            setBannerTop(null);
            setBannerLeft(null);
            setBannerWidth(null);
            previewTimeoutRef.current = null;
        }, previewDurationMs);
    }, [clearPreviewTimer, containerSize, gridLayoutByGroup]);

    return {
        bannerLeft,
        bannerWidth,
        clearPreview,
        handleContainerLayout,
        handleGridLayout,
        handleLinkLayout,
        previewedLink,
        safeBannerTop,
        showExternalLinkPreview,
    };
}

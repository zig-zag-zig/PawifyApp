// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseGroupReleaseListItem } from '@pawify/shared';

const { shareMock, createURLMock } = vi.hoisted(() => ({
    shareMock: vi.fn(async () => ({ action: 'sharedAction' })),
    createURLMock: vi.fn((path: string) => `pawify://${path}`),
}));

vi.mock('react-native', () => ({
    StyleSheet: {
        create: <T,>(styles: T): T => styles,
    },
    View: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    Text: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('span', null, children),
    TouchableOpacity: ({
        children,
        onPress,
        accessibilityLabel,
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
        accessibilityLabel?: string;
    }) =>
        React.createElement(
            'button',
            { type: 'button', onClick: onPress, 'aria-label': accessibilityLabel },
            children,
        ),
    ScrollView: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    FlatList: ({
        data = [],
        renderItem,
        ListEmptyComponent,
    }: {
        data?: unknown[];
        renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
        ListEmptyComponent?: React.ReactNode;
    }) =>
        React.createElement(
            'div',
            null,
            data.length === 0
                ? ListEmptyComponent
                : data.map((item, index) =>
                      React.createElement(
                          React.Fragment,
                          { key: index },
                          renderItem({ item, index }),
                      ),
                  ),
        ),
    Share: { share: shareMock },
}));

vi.mock('@expo/vector-icons', () => ({
    MaterialIcons: () => null,
}));

vi.mock('expo-linking', () => ({
    createURL: createURLMock,
}));

vi.mock('../../../components/ui', () => ({
    ScreenContainer: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    InlineLink: ({
        children,
        onPress,
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
    }) => React.createElement('button', { type: 'button', onClick: onPress }, children),
    SelectableText: ({
        children,
        numberOfLines,
    }: {
        children?: React.ReactNode;
        numberOfLines?: number;
    }) =>
        React.createElement(
            'span',
            { 'data-number-of-lines': numberOfLines },
            children,
        ),
}));

vi.mock('../../../components/cachedImage/CachedImageComponent', () => ({
    CachedImageComponent: () => null,
}));

import ReleaseGroupCard from './ReleaseGroupCard';

const buildRelease = (
    overrides: Partial<ReleaseGroupReleaseListItem> = {},
): ReleaseGroupReleaseListItem => ({
    id: 'release-1',
    title: 'Album Deluxe',
    date: '2025-03-14',
    trackCount: 18,
    formats: ['CD'],
    country: 'US',
    status: 'Official',
    ...overrides,
});

const renderCard = (
    releases: ReleaseGroupReleaseListItem[],
    onPress = vi.fn(),
) => {
    render(
        <ReleaseGroupCard
            releaseGroupTitle="Group One"
            releases={releases}
            releaseCount={releases.length}
            releaseCovers={{}}
            pendingReleaseCoverIds={[]}
            releaseGroupId="group-1"
            isLoadingReleases={false}
            releaseLoadFailed={false}
            releaseGroupNotFound={false}
            onPress={onPress}
            onRetryLoadReleases={() => {}}
            onContentReady={() => {}}
        />,
    );

    return onPress;
};

describe('ReleaseGroupCard', () => {
    it('renders one format with a known track count and date', () => {
        renderCard([buildRelease()]);

        expect(screen.getByText('CD · 18 tracks · 14-Mar-2025')).toBeTruthy();
    });

    it('renders multiple formats', () => {
        renderCard([buildRelease({ formats: ['CD', 'DVD'], trackCount: 24 })]);

        expect(screen.getByText('CD + DVD · 24 tracks · 14-Mar-2025')).toBeTruthy();
    });

    it('omits an unknown track count', () => {
        renderCard([buildRelease({ trackCount: null })]);

        expect(screen.getByText('CD · 14-Mar-2025')).toBeTruthy();
        expect(screen.queryByText(/tracks/)).toBeNull();
    });

    it('omits a missing date', () => {
        renderCard([buildRelease({ date: null })]);

        expect(screen.getByText('CD · 18 tracks')).toBeTruthy();
        expect(screen.queryByText(/Unknown date/)).toBeNull();
    });

    it('shows a non-Official status', () => {
        renderCard([buildRelease({ status: 'Bootleg', trackCount: 15 })]);

        expect(screen.getByText('CD · 15 tracks · 14-Mar-2025 · Bootleg')).toBeTruthy();
    });

    it('never shows Official as a status chip', () => {
        renderCard([buildRelease()]);

        expect(screen.queryByText(/Official/)).toBeNull();
    });

    it('keeps a long title to two lines', () => {
        const title = 'A Very Long Album Title That Would Otherwise Wrap Across Many Lines';
        renderCard([buildRelease({ title })]);

        const titleNode = screen.getByText(title);
        expect(titleNode.getAttribute('data-number-of-lines')).toBe('2');
    });

    it('puts the title and meaningful metadata in the accessibility label', () => {
        renderCard([buildRelease()]);

        expect(
            screen.getByRole('button', {
                name: 'Open release Album Deluxe, CD · 18 tracks · 14-Mar-2025',
            }),
        ).toBeTruthy();
    });

    it('still presses through to the release id', () => {
        const onPress = renderCard([buildRelease({ id: 'release-42' })]);

        screen.getByRole('button', { name: /Open release Album Deluxe/ }).click();

        expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'release-42' }));
    });

    it('renders a V2-shaped row without inventing edition metadata', () => {
        // Old cached rows only had id/title/date. Undefined V3 fields must not
        // become "0 tracks" or an empty separator.
        renderCard([
            {
                id: 'legacy-release',
                title: 'Legacy Album',
                date: '2025-03-14',
            } as ReleaseGroupReleaseListItem,
        ]);

        expect(screen.getByText('Legacy Album')).toBeTruthy();
        expect(screen.getByText('14-Mar-2025')).toBeTruthy();
        expect(screen.queryByText(/tracks/)).toBeNull();
    });

    it('keeps the share action for the release group', () => {
        renderCard([buildRelease()]);

        screen.getByRole('button', { name: 'Share this release group' }).click();

        expect(createURLMock).toHaveBeenCalledWith('release-group/group-1');
        expect(shareMock).toHaveBeenCalledWith({
            message: 'Group One — pawify://release-group/group-1',
            url: 'pawify://release-group/group-1',
        });
    });
});
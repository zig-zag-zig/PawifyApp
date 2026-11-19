// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
    View: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    TouchableOpacity: ({
        children,
        onPress,
    }: {
        children?: React.ReactNode;
        onPress?: () => void;
    }) => React.createElement('button', { type: 'button', onClick: onPress }, children),
}));

vi.mock('../../../components/cachedImage/CachedImageComponent', () => ({
    CachedImageComponent: () => null,
}));

vi.mock('../../../components/ui', () => ({
    SelectableText: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('span', null, children),
}));

vi.mock('../../../styles/styles', () => ({
    getStyles: () => ({}),
}));

import ReleaseItem from './ReleaseItem';

const release = (overrides: Record<string, unknown> = {}) =>
    ({
        id: 'release-1',
        title: 'Midnight Signals',
        date: '2025-04-18',
        disambiguation: null,
        artists: { 'artist-1': 'Aurora Test Ensemble' },
        date_for_display: '18 April 2025',
        'primary-type': 'Album',
        releaseGroupId: 'group-1',
        releaseCount: 2,
        cover_url: undefined,
        ...overrides,
    }) as never;

const renderItem = (overrides: Record<string, unknown> = {}) =>
    render(
        <ReleaseItem
            release={release(overrides)}
            isSelected={false}
            onPress={() => {}}
            onLongPress={() => {}}
        />,
    );

describe('ReleaseItem', () => {
    it('shows more-tracks event metadata in the feed', () => {
        renderItem({ notificationReason: 'more-tracks', trackCount: 18 });

        expect(screen.getByText('18 tracks')).toBeTruthy();
    });

    it('shows deluxe edition and track count together', () => {
        renderItem({
            notificationReason: 'new-edition',
            trackCount: 18,
            editionKeywords: ['deluxe'],
        });

        expect(screen.getByText('Deluxe edition · 18 tracks')).toBeTruthy();
    });

    it('does not show event metadata for a plain new group', () => {
        renderItem({ notificationReason: 'new-group' });

        expect(screen.queryByText(/edition|tracks/)).toBeNull();
    });
});
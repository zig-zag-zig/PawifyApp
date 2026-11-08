// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Artist } from '@pawify/shared';

const { shareMock, createURLMock, loadPreferredStreamingServiceMock } = vi.hoisted(() => ({
    shareMock: vi.fn(async () => ({ action: 'sharedAction' })),
    createURLMock: vi.fn((path: string) => `pawify://${path}`),
    loadPreferredStreamingServiceMock: vi.fn(async () => null),
}));

vi.mock('react-native', () => ({
    StyleSheet: {
        create: <T,>(styles: T): T => styles,
        absoluteFill: {},
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
    Share: { share: shareMock },
}));

vi.mock('@expo/vector-icons', () => ({
    MaterialCommunityIcons: () => null,
    MaterialIcons: () => null,
}));

vi.mock('expo-linking', () => ({
    createURL: createURLMock,
}));

vi.mock('../../../components/ui', () => ({
    SelectableText: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('span', null, children),
}));

vi.mock('../../../components/ExternalLinksGrid', () => ({ default: () => null }));
vi.mock('../../../services/brokenEntityImageReporter', () => ({
    useBrokenEntityImageReporter: () => vi.fn(),
}));
vi.mock('../../../components/ResponsiveHeaderImage', () => ({ ResponsiveHeaderImage: () => null }));
vi.mock('./ArtistRelationships', () => ({ default: () => null }));

vi.mock('../../../services/preferredStreamingService', () => ({
    loadPreferredStreamingService: loadPreferredStreamingServiceMock,
    savePreferredStreamingService: vi.fn(),
}));

vi.mock('../../../styles/styles', () => ({
    getStyles: () => ({
        container: { backgroundColor: '#000' },
        text: { color: '#fff' },
        title: {},
        artistHeaderTextContainer: {},
        artistPageBlock: {},
    }),
}));

import ArtistHeader from './ArtistHeader';

const buildArtist = (overrides: Partial<Artist> = {}): Artist => ({
    id: 'b3c1b4bd-4e5f-4bbd-8fd1-8c6f39f2f0e5',
    name: 'Czarface',
    type: 'Group',
    disambiguation: null,
    aliases: [],
    members: [],
    externalLinks: [],
    lifeSpan: { begin: null, end: null, ended: false },
    beginArea: { name: null },
    ...overrides,
});

const renderHeader = (artist: Artist | undefined) =>
    render(
        <ArtistHeader
            artist={artist}
            isLoadingArtist={false}
            isFollowLoading={false}
            isFollowDisabled={false}
            isFollowing={false}
            onToggleFollow={() => {}}
            profilePictures={{}}
            pendingArtistImageIds={[]}
            onArtistPressed={() => {}}
            onRelationshipsExpanded={() => {}}
        />,
    );

describe('ArtistHeader share button', () => {
    beforeEach(() => {
        shareMock.mockClear();
        createURLMock.mockClear();
    });

    it('renders a share button for the artist', () => {
        renderHeader(buildArtist());

        expect(screen.getByRole('button', { name: 'Share Czarface' })).toBeTruthy();
    });

    it('shares the artist name with a deep link to the artist screen', () => {
        const artist = buildArtist();

        renderHeader(artist);
        screen.getByRole('button', { name: 'Share Czarface' }).click();

        expect(createURLMock).toHaveBeenCalledWith(`artist/${artist.id}`);
        expect(shareMock).toHaveBeenCalledTimes(1);
        expect(shareMock).toHaveBeenCalledWith({
            message: `Czarface — pawify://artist/${artist.id}`,
            url: `pawify://artist/${artist.id}`,
        });
    });

    it('includes the disambiguation in the shared name', () => {
        const artist = buildArtist({ name: 'Nirvana', disambiguation: 'US grunge band' });

        renderHeader(artist);
        screen.getByRole('button', { name: 'Share Nirvana (US grunge band)' }).click();

        expect(shareMock).toHaveBeenCalledWith({
            message: `Nirvana (US grunge band) — pawify://artist/${artist.id}`,
            url: `pawify://artist/${artist.id}`,
        });
    });
});
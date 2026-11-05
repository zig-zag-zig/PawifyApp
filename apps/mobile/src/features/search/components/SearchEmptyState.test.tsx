// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { SearchScope } from '../../../services/searchHistoryStorage';

vi.mock('react-native', () => ({
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    View: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('div', null, children),
    Text: ({ children }: { children?: React.ReactNode }) =>
        React.createElement('span', null, children),
}));

vi.mock('@expo/vector-icons', () => ({
    MaterialIcons: () => null,
}));

import SearchEmptyState from './SearchEmptyState';

describe('SearchEmptyState', () => {
    it('tells the user what the artists tab searches', () => {
        render(React.createElement(SearchEmptyState, { scope: 'artists' as SearchScope }));
        expect(screen.getByText('Search artists, releases, and tracks')).toBeTruthy();
    });

    it('tells the user what the releases tab searches', () => {
        render(React.createElement(SearchEmptyState, { scope: 'releases' as SearchScope }));
        expect(screen.getByText('Search artists, releases, and tracks')).toBeTruthy();
    });

    it('renders the same guidance in compact mode (used above the history list)', () => {
        render(
            React.createElement(SearchEmptyState, {
                scope: 'artists' as SearchScope,
                compact: true,
            }),
        );
        expect(screen.getByText('Search artists, releases, and tracks')).toBeTruthy();
    });
});

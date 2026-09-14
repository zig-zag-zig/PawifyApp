// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { SearchScope } from '../../../services/searchHistoryStorage';

vi.mock('../../../components/ui', () => ({
    TextField: ({ placeholder }: { placeholder?: string }) =>
        React.createElement('div', { 'data-testid': 'placeholder' }, placeholder),
}));

import SearchInput from './SearchInput';

const renderPlaceholder = (scope: SearchScope): string | null => {
    render(
        React.createElement(SearchInput, {
            query: '',
            scope,
            onChangeText: () => {},
            onSubmitEditing: () => {},
        }),
    );
    return screen.getByTestId('placeholder').textContent;
};

describe('SearchInput', () => {
    it('prompts for artists on the artists tab', () => {
        expect(renderPlaceholder('artists')).toBe('Search artists');
    });

    it('prompts for releases on the releases tab', () => {
        // The input is shared by both tabs, so the placeholder must follow the
        // active tab instead of always saying "Search artists".
        expect(renderPlaceholder('releases')).toBe('Search releases');
    });
});

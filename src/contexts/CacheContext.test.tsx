// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

vi.mock('react-native', () => ({
    StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

vi.mock('../services/cache/useFileCacheMaintenance', () => ({
    useFileCacheMaintenance: () => ({
        updateAccessTime: vi.fn(),
        cleanUpCache: vi.fn(),
    }),
}));

import { CacheProvider, useCache } from '../contexts/CacheContext';

const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(CacheProvider, null, children);

describe('CacheContext', () => {
    it('provides empty initial cache maps', () => {
        const { result } = renderHook(() => useCache(), { wrapper });
        expect(result.current.artistProfileImages).toEqual({});
        expect(result.current.releaseGroupCovers).toEqual({});
        expect(result.current.releaseTracksLyrics).toEqual({});
    });

    it('setArtistProfileImages updates state', () => {
        const { result } = renderHook(() => useCache(), { wrapper });

        act(() => {
            result.current.setArtistProfileImages({ 'artist-1': 'url1' });
        });

        expect(result.current.artistProfileImages).toEqual({ 'artist-1': 'url1' });
    });

    it('setReleaseGroupCovers updates state', () => {
        const { result } = renderHook(() => useCache(), { wrapper });

        act(() => {
            result.current.setReleaseGroupCovers({ 'rg-1': 'cover1' });
        });

        expect(result.current.releaseGroupCovers).toEqual({ 'rg-1': 'cover1' });
    });

    it('setReleaseTracksLyrics updates state via updater function', () => {
        const { result } = renderHook(() => useCache(), { wrapper });

        act(() => {
            result.current.setReleaseTracksLyrics({ 't1': 'line1' });
        });
        act(() => {
            result.current.setReleaseTracksLyrics(prev => ({ ...prev, 't2': 'line2' }));
        });

        expect(result.current.releaseTracksLyrics).toEqual({ 't1': 'line1', 't2': 'line2' });
    });

    it('throws when useCache is used outside CacheProvider', () => {
        // Suppress error boundary log
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => renderHook(() => useCache())).toThrow(
            'useCache must be used within a CacheProvider',
        );
        spy.mockRestore();
    });
});

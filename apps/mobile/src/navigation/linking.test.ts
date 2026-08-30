import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-linking', () => ({
    createURL: (path: string) => `https://expo.test/${path}`,
}));

import { linking } from './linking';

type LinkingConfigScreens = Record<string, string | { path?: string; screens?: Record<string, unknown> }>;

const screens = (linking.config as unknown as { screens: LinkingConfigScreens }).screens;

describe('linking config', () => {
    it('maps the existing tab screens under Home', () => {
        const home = screens.Home as { screens: Record<string, unknown> };
        expect(home.screens).toEqual({
            Search: 'search',
            Artists: 'artists',
            Releases: 'releases',
            Menu: 'menu',
        });
    });

    it('maps stack screens with their params', () => {
        expect(screens.Artist).toMatchObject({ path: 'artist/:artistId' });
        expect(screens.Release).toMatchObject({ path: 'release/:releaseId' });
        expect(screens.Security).toMatchObject({ path: 'security/:actionType' });
    });

    it('maps auth stack screens', () => {
        expect(screens.SignIn).toBe('sign-in');
        expect(screens.SignUp).toBe('sign-up');
        expect(screens.ForgotPassword).toBe('forgot-password');
        expect(screens.ResetPassword).toMatchObject({ path: 'reset-password/:tempToken' });
    });

    it('does not deep-link ReleaseGroup (params carry data, not URLs)', () => {
        expect(screens.ReleaseGroup).toBeUndefined();
    });
});

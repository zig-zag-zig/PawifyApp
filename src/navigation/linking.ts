import * as Linking from 'expo-linking';

export const linking = {
    prefixes: [
        'pawify://', // For standalone apps
        Linking.createURL('/'), // For Expo Go
    ],
    config: {
        screens: {
            Home: {
                path: '',
                screens: {
                    Search: 'search',
                    Artists: 'artists',
                    Releases: 'releases',
                    Menu: 'menu',
                },
            },
            Artist: {
                path: 'artist/:artistId',
            },
            Release: {
                path: 'release/:releaseId',
            },
            Security: {
                path: 'security/:actionType',
            },
            // ReleaseGroup is intentionally NOT deep-linked: its route params
            // carry a full releases array that cannot be expressed in a URL.
            SignIn: 'sign-in',
            SignUp: 'sign-up',
            ForgotPassword: 'forgot-password',
            ResetPassword: {
                path: 'reset-password/:tempToken',
            },
        },
    },
};

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
            ReleaseGroup: {
                path: 'release-group/:releaseGroupId',
            },
            SignIn: 'sign-in',
            SignUp: 'sign-up',
            ForgotPassword: 'forgot-password',
            ResetPassword: {
                path: 'reset-password/:tempToken',
            },
        },
    },
};

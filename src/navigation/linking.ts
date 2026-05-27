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
                    Releases: 'releases',
                },
            }
        },
    },
};
import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import ArtistPage from '../features/artist/pages/ArtistPage';
import SecurityPage from '../features/auth/pages/SecurityPage';
import ReleaseGroupPage from '../features/release/pages/ReleaseGroupPage';
import ReleasePage from '../features/release/pages/ReleasePage';
import { TabNavigator } from './TabNavigator';

const Stack = createStackNavigator();

export const MainStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={TabNavigator} />
        <Stack.Screen name="Artist" component={ArtistPage} />
        <Stack.Screen name="Release" component={ReleasePage} />
        <Stack.Screen name="ReleaseGroup" component={ReleaseGroupPage} />
        <Stack.Screen name="Security" component={SecurityPage} />
    </Stack.Navigator>
);

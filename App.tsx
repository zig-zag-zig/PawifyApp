import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import 'react-native-gesture-handler';
import 'react-native-reanimated';
import { AppNavigator } from './src/navigation/AppNavigator';
import { linking } from './src/navigation/linking';
import { AppProviders } from './src/providers/AppProviders';
import { initErrorMonitoring, wrapWithErrorMonitoring } from './src/services/monitoring/sentry';
import { theme } from './src/styles/theme';

initErrorMonitoring();

const appBackgroundColor = theme.colors.appBackground;

const AppContent = () => {
  return (
    <NavigationContainer linking={linking}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={appBackgroundColor}
        translucent={false}
      />
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: appBackgroundColor }}>
        <AppNavigator />
      </SafeAreaView>
    </NavigationContainer>
  );
};

function App() {
  return (
    <SafeAreaProvider>
      <AppProviders>
        <AppContent />
      </AppProviders>
    </SafeAreaProvider>
  );
}

export default wrapWithErrorMonitoring(App);

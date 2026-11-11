import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Menu from '../features/menu/MenuPage';
import ArtistsPage from '../features/artists/pages/ArtistsPage';
import ReleasesPage from '../features/release/pages/ReleasesPage';
import SearchPage from '../features/search/pages/SearchPage';
import { theme } from '../styles/theme';

const Tab = createBottomTabNavigator();
const TAB_BAR_ICON_SIZE = theme.tabBar.iconSize;

type TabIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TAB_ICONS: Record<string, { icon: TabIconName; label: string }> = {
  Search: { icon: 'magnify', label: 'Search' },
  Artists: { icon: 'account-music', label: 'Artists' },
  Releases: { icon: 'album', label: 'Releases' },
  Menu: { icon: 'menu', label: 'Menu' },
};

const FloatingDockTabBar = ({ state, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (keyboardVisible) {
    return null;
  }

  return (
    <View style={[styles.dockOuter, { paddingBottom: Math.max(insets.bottom, 6) + 8 }]}>
      <View style={styles.dockPill}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const meta = TAB_ICONS[route.name] ?? { icon: 'circle', label: route.name };
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={meta.label}
              style={[styles.tabSlot, isFocused && styles.tabSlotActive]}
            >
              <MaterialCommunityIcons
                name={meta.icon}
                size={TAB_BAR_ICON_SIZE}
                color={isFocused ? theme.colors.tabBarActive : theme.colors.tabBarInactive}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export const TabNavigator = () => (
  <Tab.Navigator
    backBehavior="history"
    tabBar={(props) => <FloatingDockTabBar {...props} />}
    screenOptions={{
      headerShown: false,
      freezeOnBlur: true,
    }}
  >
    <Tab.Screen name="Search" component={SearchPage} />
    <Tab.Screen name="Artists" component={ArtistsPage} />
    <Tab.Screen name="Releases" component={ReleasesPage} />
    <Tab.Screen name="Menu" component={Menu} />
  </Tab.Navigator>
);

const styles = StyleSheet.create({
  dockOuter: {
    backgroundColor: theme.colors.appBackground,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  dockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    backgroundColor: theme.colors.tabBarSurface,
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tabSlot: {
    flex: 1,
    height: 52,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSlotActive: {
    backgroundColor: theme.colors.tabBarItemActiveBg,
  },
});
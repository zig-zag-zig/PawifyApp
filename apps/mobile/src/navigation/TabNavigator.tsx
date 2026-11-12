import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Menu from '../features/menu/MenuPage';
import ArtistsPage from '../features/artists/pages/ArtistsPage';
import ReleasesPage from '../features/release/pages/ReleasesPage';
import SearchPage from '../features/search/pages/SearchPage';
import { theme } from '../styles/theme';

const Tab = createBottomTabNavigator();
const TAB_BAR_HEIGHT = theme.tabBar.height;
const TAB_BAR_ICON_SIZE = theme.tabBar.iconSize;

type TabIconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const TabIcon = ({
  name,
  color,
  focused,
}: {
  name: TabIconName;
  color: string;
  focused: boolean;
}) => (
  <View style={[styles.iconPill, focused && styles.iconPillActive]}>
    <MaterialCommunityIcons name={name} size={TAB_BAR_ICON_SIZE} color={color} />
  </View>
);

export const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
          borderTopWidth: 1,
          borderTopColor: theme.colors.tabBarBorder,
          elevation: 0,
          backgroundColor: theme.colors.tabBarSurface,
        },
        tabBarIconStyle: {
          height: 32,
          width: 48,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingTop: 0,
          paddingBottom: 0,
        },
        freezeOnBlur: true,
      }}
    >
      <Tab.Screen
        name="Search"
        component={SearchPage}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="magnify" color={color} focused={focused} />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Artists"
        component={ArtistsPage}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="account-music" color={color} focused={focused} />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Releases"
        component={ReleasesPage}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="album" color={color} focused={focused} />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Menu"
        component={Menu}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="menu" color={color} focused={focused} />
          ),
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  iconPill: {
    width: 46,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: theme.colors.selectionBackground,
  },
});
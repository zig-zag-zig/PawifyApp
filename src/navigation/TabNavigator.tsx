import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Menu from '../features/menu/MenuPage';
import ArtistsPage from '../features/artists/pages/ArtistsPage';
import ReleasesPage from '../features/release/pages/ReleasesPage';
import SearchPage from '../features/search/pages/SearchPage';
import { theme } from '../styles/theme';

const Tab = createBottomTabNavigator();
const TAB_BAR_HEIGHT = theme.tabBar.height;
const TAB_BAR_ICON_SIZE = theme.tabBar.iconSize;
const TAB_BAR_ICON_OFFSET = theme.tabBar.iconOffset;

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
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 0,
          borderTopWidth: 1,
          borderTopColor: theme.colors.tabBarBorder,
          elevation: 0,
          backgroundColor: 'transparent',
        },
        tabBarIconStyle: {
          height: TAB_BAR_ICON_SIZE,
          marginTop: TAB_BAR_ICON_OFFSET,
          width: TAB_BAR_ICON_SIZE,
        },
        tabBarItemStyle: {
          justifyContent: 'center',
          paddingTop: 0,
          paddingBottom: 0,
        },
        freezeOnBlur: true,
        tabBarBackground: () => (
          <LinearGradient
            colors={[theme.colors.tabBarBackgroundStart, theme.colors.tabBarBackgroundEnd]}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
            }}
          />
        ),
      }}
    >
      <Tab.Screen
        name="Search"
        component={SearchPage}
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="magnify" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Artists"
        component={ArtistsPage}
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="account-music" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Releases"
        component={ReleasesPage}
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="album" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Menu"
        component={Menu}
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="menu" size={TAB_BAR_ICON_SIZE} color={color} />
          ),
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
};

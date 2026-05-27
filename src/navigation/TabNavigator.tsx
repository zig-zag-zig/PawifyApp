import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Menu from '../components/Menu';
import ArtistsPage from '../features/artists/pages/ArtistsPage';
import ReleasesPage from '../features/release/pages/ReleasesPage';
import SearchPage from '../features/search/pages/SearchPage';

const Tab = createBottomTabNavigator();
const TAB_BAR_HEIGHT = 48;
const TAB_BAR_ICON_SIZE = 28;
const TAB_BAR_ICON_OFFSET = 8;

export const TabNavigator = () => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  return (
    <Tab.Navigator
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor: '#FFF',
        tabBarInactiveTintColor: '#888',
        tabBarShowLabel: false,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 0,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.08)',
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
            colors={['#181818', '#2a2a2a']}
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

// App.tsx
// Navigation shell: a bottom tab bar for browsing, wrapped in a stack so the
// title page and the player can take over the whole screen.

import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './screens/HomeScreen';
import ReelsScreen from './screens/ReelsScreen';
import SearchScreen from './screens/SearchScreen';
import MyListScreen from './screens/MyListScreen';
import TitleScreen from './screens/TitleScreen';
import PlayerScreen from './screens/PlayerScreen';
import AboutScreen from './screens/AboutScreen';
import { colors } from './lib/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

/** Navigation's dark theme, retuned to the app's true-black palette. */
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    primary: colors.accent,
    border: 'transparent',
  },
};

const TAB_ICONS: Record<
  string,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Reels: { active: 'play-circle', inactive: 'play-circle-outline' },
  Search: { active: 'search', inactive: 'search-outline' },
  'My List': { active: 'bookmark', inactive: 'bookmark-outline' },
};

function Tabs() {
  return (
    <Tab.Navigator
      id={undefined}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name] ?? TAB_ICONS.Home;
          return <Ionicons name={focused ? icons.active : icons.inactive} size={23} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Reels" component={ReelsScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="My List" component={MyListScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <NavigationContainer theme={navTheme}>
            <Stack.Navigator
              id={undefined}
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="Title" component={TitleScreen} />
              <Stack.Screen name="About" component={AboutScreen} />
              <Stack.Screen
                name="Player"
                component={PlayerScreen}
                options={{ animation: 'fade' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tabBar: {
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    height: Platform.OS === 'ios' ? 84 : 62,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 26 : 8,
  },
  tabLabel: { fontSize: 10, fontWeight: '600' },
});

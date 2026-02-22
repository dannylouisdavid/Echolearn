import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';

export default function ParentTabsLayout() {
    const insets = useSafeAreaInsets();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#1e1e1e',
                    borderTopWidth: 0,
                    height: 60 + insets.bottom,
                    paddingBottom: insets.bottom,
                    paddingTop: 5,
                },
                tabBarActiveTintColor: '#35c128', // Green for Parent
                tabBarInactiveTintColor: '#666',
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Dashboard',
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="view-dashboard" size={size} color={color} />
                    ),
                }}
            />

            <Tabs.Screen
                name="link-student"
                options={{
                    title: 'Link Student',
                    tabBarIcon: ({ color, size }) => (
                        <MaterialCommunityIcons name="account-plus" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}

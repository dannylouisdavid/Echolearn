import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function StudentLayout() {
    return (
        <Tabs screenOptions={{
            tabBarActiveTintColor: '#35c128',
            tabBarInactiveTintColor: '#888',
            tabBarStyle: { backgroundColor: '#1e1e1e', borderTopColor: '#333' },
            headerShown: false
        }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: "Dashboard",
                    tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-dashboard" size={24} color={color} />
                }}
            />
            <Tabs.Screen
                name="notebooks"
                options={{
                    title: "Notebooks",
                    tabBarIcon: ({ color }) => <MaterialCommunityIcons name="notebook" size={24} color={color} />
                }}
            />
        </Tabs>
    );
}

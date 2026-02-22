import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../services/auth/AuthContext';
import { subscribeToConversations } from '../../../services/messaging';

export default function TeacherTabsLayout() {
    const { user } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!user) return;
        const unsub = subscribeToConversations(user.uid, (conversations) => {
            let total = 0;
            conversations.forEach(c => {
                total += (c.unreadCounts[user.uid] || 0);
            });
            setUnreadCount(total);
        });
        return () => unsub();
    }, [user]);

    return (
        <Tabs screenOptions={{ tabBarActiveTintColor: '#35c128', headerShown: false, tabBarStyle: { backgroundColor: '#121212' } }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Dashboard',
                    tabBarIcon: ({ color }) => <MaterialCommunityIcons name="view-dashboard" size={24} color={color} />
                }}
            />
            <Tabs.Screen
                name="notebooks"
                options={{
                    title: 'Notebooks',
                    tabBarIcon: ({ color }) => <MaterialCommunityIcons name="notebook-multiple" size={24} color={color} />
                }}
            />
            <Tabs.Screen
                name="messages"
                options={{
                    title: 'Messages',
                    tabBarIcon: ({ color }) => <MaterialCommunityIcons name="message-text" size={24} color={color} />,
                    tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
                    tabBarBadgeStyle: { backgroundColor: '#FF3B30', fontSize: 10 }
                }}
            />
            <Tabs.Screen
                name="group_management"
                options={{
                    title: 'Groups',
                    tabBarIcon: ({ color }) => <MaterialCommunityIcons name="account-group" size={24} color={color} />
                }}
            />
        </Tabs>
    );
}

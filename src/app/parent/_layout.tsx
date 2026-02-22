import { Stack } from 'expo-router';
import { useAuth } from '../../services/auth/AuthContext';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function ParentLayout() {
    const { user, userProfile, isLoading } = useAuth();

    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
                <ActivityIndicator size="large" color="#35c128" />
            </View>
        );
    }

    if (!user) {
        return <Redirect href="/login" />;
    }

    if (userProfile?.role !== 'parent') {
        // Redirect if not parent (simple protection)
        return <Redirect href="/role-selection" />;
    }

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="student/[id]" options={{ headerShown: false, presentation: 'card' }} />
        </Stack>
    );
}

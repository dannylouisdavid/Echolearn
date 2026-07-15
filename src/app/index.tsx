import { useEffect } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuth } from '../services/auth/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function Index() {
    const { user, userProfile, isLoading } = useAuth();
    const router = useRouter();

    const rootNavigationState = useRootNavigationState();

    useEffect(() => {
        if (isLoading) return;
        if (!rootNavigationState?.key) return; // Wait for navigation to be ready

        if (user && userProfile) {
            if (userProfile.role === 'student') {
                const student = userProfile as any;
                if (!student.onboardingCompleted) {
                    router.replace('/student/onboarding');
                } else {
                    router.replace('/student/(tabs)');
                }
            } else if (userProfile.role === 'teacher') {
                router.replace('/teacher/(tabs)');
                // alert("Teacher dashboard not implemented yet");
            } else {
                router.replace('/parent/(tabs)');
            }
        }
    }, [user, userProfile, isLoading, rootNavigationState?.key]);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" />
        </View>
    );
}

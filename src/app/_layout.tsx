import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../services/auth/AuthContext';
import { registerForPushNotificationsAsync } from '../services/notifications';
import { View, ActivityIndicator } from 'react-native';

SplashScreen.preventAutoHideAsync();

function InitialLayout() {
    const { user, userProfile, isLoading, trialBypass, emailBypass } = useAuth();
    const segments = useSegments() as string[];
    const router = useRouter();
    const rootNavigationState = useRootNavigationState();
    const loaded = true; // Placeholder for font loading

    useEffect(() => {
        if (loaded && !isLoading) {
            SplashScreen.hideAsync();
        }
    }, [loaded, isLoading]);

    useEffect(() => {
        if (isLoading) return;
        if (!rootNavigationState?.key) return; // Wait for navigation to be ready

        const inAuthGroup = segments[0] === 'login' || segments[0] === 'role-selection' || segments[0] === 'signup';
        const isSubscriptionPage = segments[0] === 'subscription';
        const isVerifyPage = segments.length > 1 && segments[0] === 'auth' && segments[1] === 'verify-email';

        console.log("LAYOUT CHECK:", {
            uid: user?.uid,
            verified: user?.emailVerified,
            bypass: emailBypass,
            hasProfile: !!userProfile,
            segments,
            isVerify: isVerifyPage
        });

        if (!user && !inAuthGroup) {
            // Redirect to login if not authenticated
            router.replace('/login');
        } else if (user) {
            if (!user.emailVerified && !emailBypass) {
                // Verification Check
                console.log(">> Redirecting to Verify Email");
                if (!isVerifyPage) router.replace('/auth/verify-email');
            } else if (!userProfile) {
                // User logged in but no profile (role selection needed)
                // Double check email verification to prevent fall-through
                const isRoleSelection = segments[0] === 'role-selection';
                if (!user.emailVerified && !emailBypass) {
                    console.log(">> Redirecting to Verify Email (Redundant Check)");
                    if (!isVerifyPage) router.replace('/auth/verify-email');
                } else if (!isRoleSelection) {
                    console.log(">> Redirecting to Role Selection");
                    router.replace('/role-selection');
                }
            } else {
                // Subscription Check (Students Only)
                const isStudent = userProfile.role === 'student';
                const sub = userProfile.subscription;
                const now = Date.now();
                const isExpires = sub?.status === 'expired';
                const isInactive = sub?.status === 'inactive';
                const isTrial = sub?.status === 'trial';
                const trialTimeRemaining = (sub?.trialEndDate || 0) - now;
                const isTrialExpired = isTrial && trialTimeRemaining <= 0;

                const isBlocked = isStudent && (isExpires || isInactive || isTrialExpired);
                const showNag = isStudent && isTrial && !isTrialExpired && !trialBypass;

                if (isBlocked) {
                    if (!isSubscriptionPage) router.replace('/subscription');
                } else if (showNag) {
                    // Redirect to subscription nag screen if not already there
                    if (!isSubscriptionPage) router.replace('/subscription');
                } else if (!isSubscriptionPage && (inAuthGroup || isVerifyPage)) {
                    // User logged in, verified, and has profile, redirect to home
                    router.replace('/');
                }
            }
        }
    }, [user, userProfile, segments, isLoading, rootNavigationState?.key, trialBypass, emailBypass]);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack screenOptions={{ contentStyle: { backgroundColor: '#121212' } }}>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="signup" options={{ headerShown: false, title: "Sign Up" }} />
                <Stack.Screen name="role-selection" options={{ headerShown: false, title: "Choose Role" }} />
                <Stack.Screen name="subscription/index" options={{ headerShown: false }} />
                <Stack.Screen name="auth/verify-email" options={{ headerShown: false }} />
                <Stack.Screen name="student" options={{ headerShown: false }} />
                <Stack.Screen name="teacher" options={{ headerShown: false }} />
                <Stack.Screen name="parent" options={{ headerShown: false }} />
            </Stack>
            {(!loaded || isLoading) && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
                    <ActivityIndicator size="large" color="#35c128" />
                </View>
            )}
        </GestureHandlerRootView>
    );
}

export default function RootLayout() {
    return (
        <AuthProvider>
            <InitialLayout />
        </AuthProvider>
    );
}

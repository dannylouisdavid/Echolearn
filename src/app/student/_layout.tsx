import { Stack } from 'expo-router';

export default function StudentLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="notebook/[id]" options={{ headerShown: true }} />
            <Stack.Screen name="page/[id]" options={{ headerShown: true }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack>
    );
}

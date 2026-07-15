import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, StatusBar, Dimensions } from 'react-native';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebaseConfig';
import { UserRole } from '../types/schema';
import { useRouter } from 'expo-router';
import { useAuth } from '../services/auth/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { CustomAlert } from '../components/CustomAlert';

const { width } = Dimensions.get('window');

export default function RoleSelectionScreen() {
    const router = useRouter();
    const { user, setProfileLocal } = useAuth(); // Get user from context

    const [alertVisible, setAlertVisible] = useState(false);
    const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

    const onRolePress = (role: UserRole) => {
        setSelectedRole(role);
        setAlertVisible(true);
    };

    const confirmRoleSelection = async () => {
        setAlertVisible(false);
        const role = selectedRole;
        if (!role) return;

        if (!user) {
            console.warn("No user found in role selection");
            return;
        }

        // IMMEDIATE DEV BYPASS: If test user, skip DB and just go.
        if (user.uid === 'test-user-123') {
            const mockProfile = {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || '',
                photoURL: user.photoURL || '',
                role: role,
                createdAt: Date.now(),
            };
            if (role === 'student') {
                (mockProfile as any).linked_users = [];
                (mockProfile as any).subscription = {
                    status: 'inactive',
                    trialEndDate: 0
                };
            }
            setProfileLocal(mockProfile as any);
            if (role === 'student') router.replace('/student/onboarding');
            else if (role === 'teacher') router.replace('/teacher/onboarding');
            else if (role === 'parent') router.replace('/parent/onboarding');
            else router.replace('/');
            return;
        }

        const newProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            role: role,
            createdAt: Date.now()
        };

        if (role === 'student') {
            (newProfile as any).subscription = {
                status: 'inactive',
                trialEndDate: 0
            };
        }

        try {
            await setDoc(doc(db, 'users', user.uid), newProfile);
            setProfileLocal(newProfile as any);

            if (role === 'student') router.replace('/student/onboarding');
            else if (role === 'teacher') router.replace('/teacher/onboarding');
            else if (role === 'parent') router.replace('/parent/onboarding');
            else router.replace('/');
        } catch (error) {
            console.error("Error setting role: ", error);
            Alert.alert("Error", "Could not save role. Please try again.");
        }
    };

    const RoleCard = ({ role, title, description, icon, color }: { role: UserRole, title: string, description: string, icon: any, color: string }) => (
        <TouchableOpacity style={styles.card} onPress={() => onRolePress(role)} activeOpacity={0.7}>
            <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
                <Ionicons name={icon} size={32} color={color} />
            </View>
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardDescription}>{description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#666" />
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="light-content" />

            <View style={styles.header}>
                <Text style={styles.title}>Welcome to <Text style={{ color: '#35c128' }}>Echolearn</Text></Text>
                <Text style={styles.subtitle}>Select your role to get a personalized experience tailored to your needs.</Text>
            </View>

            <View style={styles.content}>
                <RoleCard
                    role="student"
                    title="I am a Student"
                    description="Command your memory with the power of spaced repetition. Our intuitive algorithm ensures you maintain peak memory health..."
                    icon="school"
                    color="#4ADE80" // Green
                />

                <RoleCard
                    role="teacher"
                    title="I am a Teacher"
                    description="Manage classes, organize notebook pages, initiate conversations with students and parents, and track mastery with powerful analytics..."
                    icon="easel"
                    color="#60A5FA" // Blue
                />

                <RoleCard
                    role="parent"
                    title="I am a Parent/Guardian"
                    description="Monitor your child's learning in real-time. View progress, explore notebooks, and stay updated on their memory health and mastery..."
                    icon="people"
                    color="#A78BFA" // Purple
                />
            </View>

            <Text style={styles.footerText}>Please choose carefully. Your account role <Text style={{ fontWeight: 'bold', color: '#ff4444' }}>cannot be changed</Text> once selected.</Text>

            <CustomAlert
                visible={alertVisible}
                title="Confirm Selection"
                message={`Are you sure you want to proceed as a ${selectedRole ? selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1) : ''}? This cannot be changed later.`}
                onClose={() => setAlertVisible(false)}
                buttons={[
                    { text: 'Cancel', onPress: () => setAlertVisible(false), style: 'cancel' },
                    { text: 'Confirm', onPress: confirmRoleSelection }
                ]}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        paddingHorizontal: 24,
        paddingTop: 60
    },
    header: {
        marginBottom: 40
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 12
    },
    subtitle: {
        fontSize: 16,
        color: '#888888',
        lineHeight: 24
    },
    content: {
        gap: 24
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#161616',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#262626',
        marginBottom: 5
    },
    iconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16
    },
    cardContent: {
        flex: 1,
        marginRight: 10
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 4
    },
    cardDescription: {
        fontSize: 14,
        color: '#aaaaaa',
        lineHeight: 20
    },
    footerText: {
        position: 'absolute',
        bottom: 40,
        left: 24,
        right: 24,
        textAlign: 'center',
        color: '#444',
        fontSize: 12
    }
});

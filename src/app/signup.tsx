import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../services/auth/AuthContext';
import { useRouter } from 'expo-router';

export default function SignUpScreen() {
    const { signUpWithEmail, isLoading } = useAuth();
    const router = useRouter();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSignUp = async () => {
        if (!name || !email || !password) {
            Alert.alert('Error', 'Please fill in all fields.');
            return;
        }
        if (password.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters.');
            return;
        }

        setLoading(true);
        try {
            await signUpWithEmail(name, email, password);
        } catch (error: any) {
            Alert.alert('Sign Up Failed', error.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Image
                    source={require('../../assets/brainwarex-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Join Echolearn today</Text>

                <View style={styles.form}>
                    <Text style={styles.label}>Full Name</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="John Doe"
                        placeholderTextColor="#666"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                    />

                    <Text style={styles.label}>Email Address</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="you@school.edu"
                        placeholderTextColor="#666"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="******"
                        placeholderTextColor="#666"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={[styles.button, loading && styles.buttonDisabled]}
                        onPress={handleSignUp}
                        disabled={loading || isLoading}
                    >
                        {loading ? (
                            <ActivityIndicator color="white" />
                        ) : (
                            <Text style={styles.buttonText}>Sign Up</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.back()} style={styles.linkButton}>
                        <Text style={styles.linkText}>Already have an account? <Text style={styles.linkHighlight}>Log In</Text></Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    logo: { width: 500, height: 250, marginBottom: -60 },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8, color: '#ffffff' },
    subtitle: { fontSize: 16, color: '#aaaaaa', marginBottom: 40 },

    form: { width: '100%', maxWidth: 350 },
    label: { color: '#ccc', marginBottom: 8, fontWeight: '600' },
    input: {
        backgroundColor: '#222',
        color: 'white',
        borderRadius: 8,
        padding: 15,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#333'
    },
    button: {
        backgroundColor: '#2E7D32',
        paddingVertical: 15,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10
    },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    linkButton: { marginTop: 20, alignItems: 'center' },
    linkText: { color: '#888' },
    linkHighlight: { color: '#35c128', fontWeight: 'bold' }
});

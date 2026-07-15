import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useAuth } from '../services/auth/AuthContext';
import { AntDesign } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CustomAlert } from '../components/CustomAlert';

// ... component content replaces logic ...

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000000' },
    scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    logo: { width: 500, height: 250, marginBottom: -60 },
    title: { fontSize: 28, fontWeight: 'bold', marginBottom: 30, color: '#ffffff' },

    form: { width: '100%', maxWidth: 350, marginBottom: 20 },
    input: { backgroundColor: '#222', color: 'white', borderRadius: 8, padding: 15, marginBottom: 15, borderWidth: 1, borderColor: '#333' },

    button: { backgroundColor: '#2E7D32', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
    loginBtn: { marginTop: 5 },
    googleBtn: { width: '100%', backgroundColor: '#4285F4', flexDirection: 'row', justifyContent: 'center', gap: 10 }, // Google color
    buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

    linkButton: { marginTop: 15, alignItems: 'center' },
    linkText: { color: '#888' },
    linkHighlight: { color: '#35c128', fontWeight: 'bold' },

    dividerContainer: { flexDirection: 'row', alignItems: 'center', width: '80%', marginVertical: 20 },
    divider: { flex: 1, height: 1, backgroundColor: '#333' },
    dividerText: { marginHorizontal: 10, color: '#666' }
});
export default function LoginScreen() {
    const { promptAsync, loginWithEmail, isLoading } = useAuth();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Custom Alert State
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('');
    const [alertMessage, setAlertMessage] = useState('');

    const showAlert = (title: string, message: string) => {
        setAlertTitle(title);
        setAlertMessage(message);
        setAlertVisible(true);
    };

    const handleLogin = async () => {
        if (!email || !password) {
            showAlert("Error", "Please enter valid credentials");
            return;
        }
        setLoading(true);
        try {
            await loginWithEmail(email, password);
        } catch (e: any) {
            let msg = e.message || "Could not log in";
            if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
                msg = "Invalid email or password. Please try again.";
            } else if (msg.includes('auth/too-many-requests')) {
                msg = "Too many failed attempts. Please try again later.";
            } else if (msg.includes('auth/invalid-email')) {
                msg = "Please enter a valid email address.";
            }
            showAlert("Login Failed", msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Image
                    source={require('../../assets/brainwarex-logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text style={styles.title}>Echolearn</Text>

                {/* Email Auth Form */}
                <View style={styles.form}>
                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        placeholderTextColor="#666"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        placeholderTextColor="#666"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={[styles.button, styles.loginBtn]}
                        onPress={handleLogin}
                        disabled={loading || isLoading}
                    >
                        {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Log In</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => router.push('/signup')} style={styles.linkButton}>
                        <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkHighlight}>Sign Up</Text></Text>
                    </TouchableOpacity>
                </View>

                {/* Divider */}
                <View style={styles.dividerContainer}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.divider} />
                </View>

                {/* Social / Dev Login */}
                <TouchableOpacity
                    style={[styles.button, styles.googleBtn]}
                    onPress={() => promptAsync()}
                >
                    <AntDesign name="google" size={20} color="white" />
                    <Text style={styles.buttonText}>Sign in with Google</Text>
                </TouchableOpacity>



                <CustomAlert
                    visible={alertVisible}
                    title={alertTitle}
                    message={alertMessage}
                    onClose={() => setAlertVisible(false)}
                />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}



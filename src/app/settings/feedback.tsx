import React, { useState } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
    Platform, TouchableWithoutFeedback, Keyboard, Modal
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../services/auth/AuthContext';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import Constants from 'expo-constants';

export default function Feedback() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user, userProfile } = useAuth();

    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const handleSubmit = async () => {
        if (!message.trim()) {
            Alert.alert("Empty Feedback", "Please enter your feedback before submitting.");
            return;
        }

        setSubmitting(true);
        try {
            await addDoc(collection(db, 'feedback'), {
                userId: user?.uid || 'anonymous',
                userEmail: user?.email || 'unknown',
                userRole: userProfile?.role || 'unknown',
                message: message.trim(),
                createdAt: serverTimestamp(),
                status: 'pending',
                deviceInfo: {
                    platform: Platform.OS,
                    version: Constants.expoConfig?.version || '1.0.0'
                }
            });

            setShowSuccessModal(true);
            setMessage('');
        } catch (error) {
            console.error("Error submitting feedback:", error);
            Alert.alert("Error", "Something went wrong. Please try again later.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseSuccess = () => {
        setShowSuccessModal(false);
        router.back();
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Feedback</Text>
            </View>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={{ flex: 1 }}
                >
                    <ScrollView contentContainerStyle={styles.content}>
                        <View style={styles.infoSection}>
                            <Text style={styles.title}>We value your input</Text>
                            <Text style={styles.subtitle}>
                                Whether it's a suggestion, a report, or just some love, let us know how we can improve your learning experience.
                            </Text>
                        </View>

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.textInput}
                                placeholder="Type your feedback here..."
                                placeholderTextColor="#666"
                                multiline
                                textAlignVertical="top"
                                value={message}
                                onChangeText={setMessage}
                                maxLength={2000}
                            />
                            <Text style={styles.charCount}>{message.length}/2000</Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.submitBtn, !message.trim() && styles.submitBtnDisabled]}
                            onPress={handleSubmit}
                            disabled={submitting || !message.trim()}
                        >
                            {submitting ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={styles.submitBtnText}>Submit Feedback</Text>
                            )}
                        </TouchableOpacity>

                        <View style={styles.noteContainer}>
                            <MaterialCommunityIcons name="shield-check-outline" size={16} color="#666" style={{ marginTop: 2 }} />
                            <Text style={styles.noteText}>
                                Your feedback is sent directly to our product team. We review every message personally.
                            </Text>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>

            {/* Success Modal */}
            <Modal
                visible={showSuccessModal}
                transparent={true}
                animationType="fade"
                onRequestClose={handleCloseSuccess}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <MaterialCommunityIcons name="check-circle-outline" size={60} color="#35c128" />
                        <Text style={styles.modalTitle}>Thank You!</Text>
                        <Text style={styles.modalText}>
                            We appreciate your feedback. It helps us make Echolearn better for everyone.
                        </Text>
                        <TouchableOpacity style={styles.modalBtn} onPress={handleCloseSuccess}>
                            <Text style={styles.modalBtnText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },

    // Custom Header
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 20 },
    backBtn: { marginRight: 15 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff' },

    content: { padding: 20 },

    infoSection: { marginBottom: 30 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
    subtitle: { fontSize: 16, color: '#aaa', lineHeight: 24 },

    inputContainer: { marginBottom: 25 },
    textInput: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        minHeight: 200,
        borderWidth: 1,
        borderColor: '#333'
    },
    charCount: { alignSelf: 'flex-end', color: '#666', marginTop: 8, fontSize: 12 },

    submitBtn: {
        backgroundColor: '#2E7D32', // Darker Green
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
    },
    submitBtnDisabled: {
        opacity: 0.5
    },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    noteContainer: { flexDirection: 'row', marginTop: 30, gap: 10, paddingHorizontal: 10 },
    noteText: { color: '#666', fontSize: 13, flex: 1, lineHeight: 20 },

    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#1E1E1E',
        borderRadius: 20,
        padding: 30,
        alignItems: 'center',
        width: '100%',
        maxWidth: 340,
        borderWidth: 1,
        borderColor: '#333',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#fff',
        marginTop: 20,
        marginBottom: 10
    },
    modalText: {
        color: '#ccc',
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 25
    },
    modalBtn: {
        backgroundColor: '#2E7D32',
        paddingVertical: 12,
        paddingHorizontal: 40,
        borderRadius: 25,
        elevation: 2
    },
    modalBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    }
});

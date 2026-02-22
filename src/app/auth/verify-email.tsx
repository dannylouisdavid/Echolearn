import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Modal } from 'react-native';
import { useAuth } from '../../services/auth/AuthContext';
import { sendEmailVerification } from 'firebase/auth';
import { useRouter } from 'expo-router';

import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function VerifyEmailScreen() {
    const { user, logout, refreshProfile, setEmailBypass } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showBypassModal, setShowBypassModal] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error', onOk?: () => void }>({ visible: false, title: '', message: '', type: 'success' });
    const router = useRouter();

    const handleResend = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await sendEmailVerification(user);
            setFeedbackModal({
                visible: true,
                title: "Sent",
                message: "Verification email sent again. Check your inbox and spam folder.",
                type: 'success'
            });
        } catch (e: any) {
            setFeedbackModal({
                visible: true,
                title: "Error",
                message: e.message || "Could not send email.",
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await user.reload(); // Explicitly fetch fresh data from Firebase
            if (user.emailVerified) {
                setFeedbackModal({
                    visible: true,
                    title: "Success",
                    message: "Email verified! You can now proceed.",
                    type: 'success',
                    onOk: () => router.replace('/')
                });
            } else {
                // Show custom modal instead of Alert
                setShowBypassModal(true);
            }
        } catch (e) {
            console.error(e);
            setFeedbackModal({
                visible: true,
                title: "Error",
                message: "Could not check status. Please try again.",
                type: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleBypass = () => {
        if (setEmailBypass) setEmailBypass(true);
        setShowBypassModal(false);
        router.replace('/');
    };

    const closeFeedback = () => {
        if (feedbackModal.onOk) feedbackModal.onOk();
        setFeedbackModal({ ...feedbackModal, visible: false });
    };

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <MaterialCommunityIcons name="email-check-outline" size={80} color="#35c128" />
            </View>

            <Text style={styles.title}>Verify your Email</Text>
            <Text style={styles.desc}>
                We sent a verification link to <Text style={styles.email}>{user?.email}</Text>.
                Please click the link to continue.
            </Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleCheckStatus} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>I have verified it</Text>}
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleResend} disabled={loading}>
                    <Text style={styles.secondaryBtnText}>Resend Email</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.secondaryBtn, styles.logoutBtn]} onPress={logout} disabled={loading}>
                    <Text style={styles.logoutText}>Log Out</Text>
                </TouchableOpacity>
            </View>

            {/* Custom Bypass Modal */}
            <Modal
                transparent={true}
                visible={showBypassModal}
                animationType="fade"
                onRequestClose={() => setShowBypassModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Not Verified</Text>
                        <Text style={styles.modalDesc}>
                            Email is not verified yet. Proceed anyway (Dev Bypass)?
                        </Text>
                        <View style={styles.modalBtnRow}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowBypassModal(false)}>
                                <Text style={styles.modalCancelText}>No</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleBypass}>
                                <Text style={styles.modalConfirmText}>Yes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Feedback Modal */}
            <Modal
                transparent={true}
                visible={feedbackModal.visible}
                animationType="fade"
                onRequestClose={closeFeedback}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <Text style={[styles.modalTitle, { color: feedbackModal.type === 'error' ? '#FF3B30' : '#35c128' }]}>
                            {feedbackModal.title}
                        </Text>
                        <Text style={styles.modalDesc}>
                            {feedbackModal.message}
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.primaryBtn,
                                {
                                    marginBottom: 0,
                                    width: 'auto',
                                    alignSelf: 'flex-end',
                                    paddingHorizontal: 30,
                                    paddingVertical: 10,
                                    borderRadius: 8,
                                    backgroundColor: feedbackModal.type === 'error' ? '#FF3B30' : '#2E7D32',
                                    shadowColor: feedbackModal.type === 'error' ? '#FF3B30' : '#2E7D32'
                                }
                            ]}
                            onPress={closeFeedback}
                        >
                            <Text style={[styles.primaryBtnText, { fontSize: 16 }]}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#121212' },
    iconContainer: { marginBottom: 20, backgroundColor: 'rgba(53, 193, 40, 0.1)', padding: 20, borderRadius: 50 },
    title: { fontSize: 26, fontWeight: 'bold', marginBottom: 15, color: '#fff', textAlign: 'center' },
    desc: { textAlign: 'center', fontSize: 16, color: '#aaa', marginBottom: 40, lineHeight: 24, maxWidth: '90%' },
    email: { fontWeight: 'bold', color: '#fff' },

    primaryBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 30, marginBottom: 30, width: '100%', alignItems: 'center', elevation: 3, shadowColor: '#2E7D32', shadowOpacity: 0.3, shadowRadius: 10 },
    primaryBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    secondaryActions: { width: '100%', gap: 15 },
    secondaryBtn: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#444', backgroundColor: '#1e1e1e' },
    secondaryBtnText: { color: '#ccc', fontSize: 16, fontWeight: '600' },
    logoutBtn: { borderColor: 'transparent', backgroundColor: 'transparent', marginTop: 5 },
    logoutText: { color: '#FF3B30', fontSize: 16 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContainer: { width: '80%', backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, elevation: 5 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
    modalDesc: { fontSize: 14, color: '#aaa', marginBottom: 20 },
    modalBtnRow: { flexDirection: 'row', gap: 15, width: '100%', justifyContent: 'flex-end', marginTop: 10 },
    modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
    modalCancelText: { color: '#aaa', fontWeight: 'bold' },
    modalConfirmBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#FF3B30' },
    modalConfirmText: { color: '#fff', fontWeight: 'bold' }
});

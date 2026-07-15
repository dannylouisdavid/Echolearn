import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../services/auth/AuthContext';
import { assignInviteCode, getUserByInviteCode, sendInvite } from '../../services/invites';
import { User } from '../../types/schema';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

export default function StudentOnboarding() {
    const router = useRouter();
    const { user, userProfile, setProfileLocal } = useAuth();
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [generatingCode, setGeneratingCode] = useState(false);

    // Search
    const [searchCode, setSearchCode] = useState('');
    const [foundUser, setFoundUser] = useState<User | null>(null);
    const [searching, setSearching] = useState(false);
    const [sendingInvite, setSendingInvite] = useState(false);
    const [showCopiedModal, setShowCopiedModal] = useState(false);
    const [feedback, setFeedback] = useState<{ visible: boolean, title: string, message: string, type: 'success' | 'error' | 'info' }>({ visible: false, title: '', message: '', type: 'info' });

    useEffect(() => {
        if (!user) return;
        // Check if user already has an invite code
        if (userProfile?.inviteCode) {
            setInviteCode(userProfile.inviteCode);
        } else {
            // Generate one
            generateCode();
        }
    }, [user, userProfile]);

    const generateCode = async () => {
        if (!user) return;
        setGeneratingCode(true);
        try {
            const code = await assignInviteCode(user.uid);
            setInviteCode(code);
            // Update local context
            if (userProfile) {
                setProfileLocal({ ...userProfile, inviteCode: code });
            }
        } catch (e) {
            console.error(e);
            setFeedback({ visible: true, title: "Error", message: "Could not generate invite code.", type: 'error' });
        } finally {
            setGeneratingCode(false);
        }
    };

    const handleSearch = async () => {
        if (!searchCode.trim()) return;
        setSearching(true);
        setFoundUser(null);
        try {
            const u = await getUserByInviteCode(searchCode.trim());
            if (u) {
                if (u.role === 'student') {
                    setFeedback({ visible: true, title: "Invalid User", message: "You can only connect with Teachers or Parents.", type: 'error' });
                } else if (u.uid === user?.uid) {
                    setFeedback({ visible: true, title: "That's you!", message: "You cannot invite yourself.", type: 'info' });
                } else {
                    setFoundUser(u);
                }
            } else {
                setFeedback({ visible: true, title: "Not Found", message: "No user found with this code.", type: 'error' });
            }
        } catch (e) {
            console.error(e);
            setFeedback({ visible: true, title: "Error", message: "Search failed.", type: 'error' });
        } finally {
            setSearching(false);
        }
    };

    const handleSendInvite = async () => {
        if (!foundUser || !user || !userProfile) return;
        setSendingInvite(true);
        try {
            const type = foundUser.role === 'teacher' ? 'student_to_teacher' : 'student_to_parent';
            await sendInvite(userProfile, foundUser.email, type);
            setFeedback({ visible: true, title: "Success", message: `Invite sent to ${foundUser.displayName}!`, type: 'success' });
            setSearchCode('');
            setFoundUser(null);
        } catch (e: any) {
            setFeedback({ visible: true, title: "Error", message: e.message || "Could not send invite.", type: 'error' });
        } finally {
            setSendingInvite(false);
        }
    };

    const copyCode = async () => {
        if (inviteCode) {
            await Clipboard.setStringAsync(inviteCode);
            setShowCopiedModal(true);
        }
    };

    const handleShare = async () => {
        if (!inviteCode) return;
        try {
            await Share.share({
                message: `Join me on Echolearn! Use my invite code: ${inviteCode}`,
                title: 'Echolearn Invite Code'
            });
        } catch (error) {
            console.error(error);
        }
    };

    const handleNext = () => {
        router.replace('/student/select-exam');
    };



    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: '#121212' }}
        >
            <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                <View style={styles.header}>
                    <Text style={styles.title}>Connect with Others</Text>
                    <Text style={styles.sub}>Add your Teachers, Parents or Guardians to get started.</Text>
                </View>

                {/* My Code Section */}
                <View style={styles.codeSection}>
                    <Text style={styles.label}>Your Invite Code</Text>
                    {generatingCode ? (
                        <ActivityIndicator color="#35c128" />
                    ) : (
                        <TouchableOpacity style={styles.codeBox} onPress={copyCode}>
                            <Text style={styles.code}>{inviteCode || '...'}</Text>
                            <MaterialCommunityIcons name="content-copy" size={20} color="#666" />
                        </TouchableOpacity>
                    )}
                    <Text style={styles.hint}>Share this code with your parents or teachers.</Text>
                </View>

                {/* Search Section */}
                <View style={styles.searchSection}>
                    <Text style={styles.label}>Find Teacher / Parent / Guardian</Text>
                    <View style={styles.searchRow}>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter 6-digit Invite Code"
                            placeholderTextColor="#666"
                            value={searchCode}
                            onChangeText={(t) => setSearchCode(t.toUpperCase())}
                            maxLength={6}
                            autoCapitalize="characters"
                        />
                        <TouchableOpacity
                            style={[styles.searchBtn, (!searchCode || searching) && styles.disabledBtn]}
                            onPress={handleSearch}
                            disabled={!searchCode || searching}
                        >
                            {searching ? <ActivityIndicator color="#35c128" /> : <MaterialCommunityIcons name="magnify" size={24} color="#35c128" />}
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Found User Card */}
                {foundUser && (
                    <View style={styles.userCard}>
                        <View style={styles.userInfo}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{foundUser.displayName.charAt(0).toUpperCase()}</Text>
                            </View>
                            <View>
                                <Text style={styles.userName}>{foundUser.displayName}</Text>
                                <Text style={styles.userRole}>{foundUser.role.charAt(0).toUpperCase() + foundUser.role.slice(1)}</Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={[styles.addBtn, sendingInvite && styles.disabledBtn]}
                            onPress={handleSendInvite}
                            disabled={sendingInvite}
                        >
                            {sendingInvite ? <ActivityIndicator color="white" /> : <Text style={styles.addBtnText}>Connect</Text>}
                        </TouchableOpacity>
                    </View>
                )}

                <View style={styles.footer}>
                    <TouchableOpacity style={styles.skipBtn} onPress={handleNext}>
                        <Text style={styles.skipText}>Skip / Next</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            <Modal visible={showCopiedModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <MaterialCommunityIcons name="check-circle" size={50} color="#35c128" />
                        <Text style={styles.modalTitle}>Copied!</Text>
                        <Text style={styles.modalSub}>Code copied to clipboard.</Text>

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleShare}>
                                <MaterialCommunityIcons name="share-variant" size={20} color="#fff" />
                                <Text style={styles.modalBtnText}>Share</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setShowCopiedModal(false)}>
                                <Text style={styles.modalBtnTextSec}>Done</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Feedback Modal */}
            <Modal visible={feedback.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.feedbackContainer}>
                        <Text style={[styles.feedbackTitle, { color: feedback.type === 'error' ? '#FF3B30' : feedback.type === 'success' ? '#35c128' : '#fff' }]}>
                            {feedback.title}
                        </Text>
                        <Text style={styles.feedbackDesc}>{feedback.message}</Text>
                        <TouchableOpacity
                            style={[styles.feedbackBtn, { backgroundColor: feedback.type === 'error' ? '#FF3B30' : '#2E7D32' }]}
                            onPress={() => setFeedback({ ...feedback, visible: false })}
                        >
                            <Text style={styles.feedbackBtnText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scrollContainer: { flexGrow: 1, padding: 20, paddingTop: 60 },
    header: { marginBottom: 50 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
    sub: { fontSize: 16, color: '#aaa', marginTop: 5 },

    codeSection: { marginBottom: 60, alignItems: 'center', backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12 },
    label: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 15, alignSelf: 'flex-start' },
    codeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#252525', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#444', elevation: 1 },
    code: { fontSize: 24, fontWeight: 'bold', letterSpacing: 4, color: '#35c128' },
    hint: { fontSize: 12, color: '#666', marginTop: 15 },

    searchSection: { marginBottom: 40 },
    searchRow: { flexDirection: 'row', gap: 10 },
    input: { flex: 1, borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#252525', color: '#fff' },
    searchBtn: { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
    disabledBtn: { opacity: 0.5 },

    userCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, backgroundColor: '#1e1e1e', borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    userName: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
    userRole: { fontSize: 12, color: '#aaa' },
    addBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    addBtnText: { color: 'white', fontWeight: '600', fontSize: 12 },

    footer: { marginTop: 'auto', paddingBottom: 20 },
    skipBtn: { width: '100%', padding: 15, alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 8, borderWidth: 1, borderColor: '#333' },
    skipText: { color: '#aaa', fontWeight: 'bold', fontSize: 16 },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 16, alignItems: 'center', width: '80%', borderWidth: 1, borderColor: '#333' },
    modalTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 15, marginBottom: 5 },
    modalSub: { color: '#aaa', fontSize: 14, marginBottom: 25 },

    modalButtons: { flexDirection: 'row', gap: 15, width: '100%', justifyContent: 'center' },
    modalBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2E7D32', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 12 },
    modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    modalBtnSecondary: { paddingVertical: 12, paddingHorizontal: 25, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
    modalBtnTextSec: { color: '#fff', fontWeight: '600', fontSize: 16 },

    feedbackContainer: { width: '85%', backgroundColor: '#1e1e1e', padding: 25, borderRadius: 12, borderWidth: 1, borderColor: '#333', elevation: 10 },
    feedbackTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
    feedbackDesc: { fontSize: 16, color: '#ccc', marginBottom: 25 },
    feedbackBtn: { alignSelf: 'flex-end', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 8 },
    feedbackBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});

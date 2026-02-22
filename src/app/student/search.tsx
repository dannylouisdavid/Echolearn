import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Modal, Share } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../services/auth/AuthContext';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { sendInvite, unlinkUser, getUserByInviteCode } from '../../services/invites';
import { User } from '../../types/schema';
import * as Clipboard from 'expo-clipboard';

import { CustomAlert } from '../../components/CustomAlert';

export default function StudentSearchScreen() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    // Code Search State
    const [searchMethod, setSearchMethod] = useState<'email' | 'code'>('email');
    const [inviteCode, setInviteCode] = useState('');
    const [foundUser, setFoundUser] = useState<User | null>(null);
    const [searching, setSearching] = useState(false);
    const [showCopiedModal, setShowCopiedModal] = useState(false);
    const [successAlert, setSuccessAlert] = useState<{ visible: boolean, message: string, onOk?: () => void }>({ visible: false, message: '' });

    const [linkedTeachers, setLinkedTeachers] = useState<any[]>([]);
    const [linkedParents, setLinkedParents] = useState<any[]>([]);
    const { user, userProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        fetchLinkedUsers();
    }, [user, userProfile]);

    const fetchLinkedUsers = async () => {
        if (!user || user.uid === 'test-user-123') return; // dev mode skip

        try {
            // Need fresh profile data or listen to it, assuming userProfile is somewhat sync'd or we fetch manually
            // Let's rely on userProfile from context but if it's stale, might need to re-fetch user doc.
            // For now assuming context updates.

            // 1. Teachers
            const teacherIds = userProfile?.linkedTeachers || [];
            if (teacherIds.length > 0) {
                const tQ = query(collection(db, 'users'), where('uid', 'in', teacherIds));
                const tSnap = await getDocs(tQ);
                setLinkedTeachers(tSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
            } else {
                setLinkedTeachers([]);
            }

            // 2. Parents
            const parentIds = userProfile?.linkedParents || [];
            if (parentIds.length > 0) {
                const pQ = query(collection(db, 'users'), where('uid', 'in', parentIds));
                const pSnap = await getDocs(pQ);
                setLinkedParents(pSnap.docs.map(d => ({ uid: d.id, ...d.data() })));
            } else {
                setLinkedParents([]);
            }

        } catch (e) {
            console.log("Error fetching linked users", e);
        }
    };

    const handleUnlink = (teacher: any) => {
        Alert.alert(
            "Unlink Mentor",
            `Are you sure you want to remove ${teacher.displayName}?`,
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await unlinkUser(teacher.uid, user!.uid);
                            // Optimistic update
                            setLinkedTeachers(prev => prev.filter(t => t.uid !== teacher.uid));
                            setLinkedParents(prev => prev.filter(p => p.uid !== teacher.uid));
                        } catch (e) {
                            Alert.alert("Error", "Could not unlink user.");
                        }
                    }
                }
            ]
        );
    };

    const handleCodeSearch = async () => {
        if (!inviteCode.trim()) return;
        setSearching(true);
        setFoundUser(null);
        try {
            const u = await getUserByInviteCode(inviteCode.trim());
            if (u) {
                if (u.role === 'student') {
                    Alert.alert("Invalid User", "You can only connect with Teachers or Parents.");
                } else if (u.uid === user?.uid) {
                    Alert.alert("That's you!", "You cannot invite yourself.");
                } else {
                    setFoundUser(u);
                }
            } else {
                Alert.alert("Not Found", "No user found with this code.");
            }
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Search failed.");
        } finally {
            setSearching(false);
        }
    };

    const handleInvite = async (emailOverride?: string) => {
        const targetEmail = emailOverride || email;

        if (!targetEmail.trim()) {
            Alert.alert("Error", "Please enter an email address.");
            return;
        }

        setLoading(true);
        try {
            if (!user) throw new Error("Not authenticated");
            const cleanEmail = targetEmail.trim().toLowerCase();

            // 1. Check User Existence & Role to determine Invite Type
            const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
            const snap = await getDocs(q);

            if (snap.empty) {
                throw new Error("User with this email not found. Please ask them to sign up first.");
            }

            const targetUser = snap.docs[0].data();
            const role = targetUser.role; // 'teacher' | 'parent' | 'student'

            let inviteType: 'student_to_teacher' | 'student_to_parent' | null = null;

            if (role === 'teacher') inviteType = 'student_to_teacher';
            if (role === 'parent') inviteType = 'student_to_parent';

            if (!inviteType) {
                throw new Error("You can only invite Teachers or Parents.");
            }

            // 2. Send Invite
            await sendInvite(user as any, cleanEmail, inviteType);

            setSuccessAlert({
                visible: true,
                message: `Invite sent to ${role} (${cleanEmail})!`,
                onOk: () => {
                    setEmail('');
                    setInviteCode('');
                    setFoundUser(null);
                }
            });

        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to send invite.");
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!userProfile?.inviteCode) return;
        try {
            await Share.share({
                message: `Join me on Echolearn! Use my invite code: ${userProfile.inviteCode}`,
                title: 'Echolearn Invite Code'
            });
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
                </TouchableOpacity>
                <Text style={styles.title}>Link Mentors</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* My Code Section */}
                <View style={styles.myCodeContainer}>
                    <Text style={styles.myCodeLabel}>Your Invite Code</Text>
                    <TouchableOpacity
                        style={styles.myCodeBox}
                        onPress={() => {
                            if (userProfile?.inviteCode) {
                                Clipboard.setStringAsync(userProfile.inviteCode);
                                setShowCopiedModal(true);
                            }
                        }}
                    >
                        <Text style={styles.myCodeText}>{userProfile?.inviteCode || '...'}</Text>
                        <MaterialCommunityIcons name="content-copy" size={20} color="#666" style={styles.copyIcon} />
                    </TouchableOpacity>
                </View>

                {/* Invite Section (Priority placement) */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="account-plus" size={20} color="#35c128" />
                        <Text style={styles.cardTitle}>Add New Mentor</Text>
                    </View>

                    {/* Toggle */}
                    <View style={styles.toggleContainer}>
                        <TouchableOpacity
                            style={[styles.toggleBtn, searchMethod === 'email' && styles.toggleBtnActive]}
                            onPress={() => { setSearchMethod('email'); setFoundUser(null); }}
                        >
                            <Text style={[styles.toggleText, searchMethod === 'email' && styles.toggleTextActive]}>By Email</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.toggleBtn, searchMethod === 'code' && styles.toggleBtnActive]}
                            onPress={() => { setSearchMethod('code'); setFoundUser(null); }}
                        >
                            <Text style={[styles.toggleText, searchMethod === 'code' && styles.toggleTextActive]}>By Invite Code</Text>
                        </TouchableOpacity>
                    </View>

                    {searchMethod === 'email' ? (
                        <>
                            <Text style={styles.label}>Enter Email Address</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="parent@example.com"
                                placeholderTextColor="#666"
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />

                            <TouchableOpacity
                                style={[styles.btn, (!email || !/\S+@\S+\.\S+/.test(email) || loading) && styles.btnDisabled]}
                                onPress={() => handleInvite()}
                                disabled={!email || !/\S+@\S+\.\S+/.test(email) || loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.btnText}>Send Invitation</Text>
                                )}
                            </TouchableOpacity>

                            <Text style={styles.infoText}>
                                We'll automatically detect if they are a Teacher or Parent.
                            </Text>
                        </>
                    ) : (
                        <>
                            <Text style={styles.label}>Enter 6-Digit Code</Text>
                            <View style={styles.codeRow}>
                                <TextInput
                                    style={[styles.input, { flex: 1, marginBottom: 0, textAlign: 'center', letterSpacing: 4, fontWeight: 'bold' }]}
                                    placeholder="AB12CD"
                                    placeholderTextColor="#666"
                                    value={inviteCode}
                                    onChangeText={t => setInviteCode(t.toUpperCase())}
                                    autoCapitalize="characters"
                                    maxLength={6}
                                />
                                <TouchableOpacity
                                    style={styles.searchBtn}
                                    onPress={handleCodeSearch}
                                    disabled={searching}
                                >
                                    {searching ? <ActivityIndicator color="#fff" /> : <MaterialCommunityIcons name="magnify" size={24} color="#fff" />}
                                </TouchableOpacity>
                            </View>

                            {/* Found User Result */}
                            {foundUser && (
                                <View style={styles.foundUserContainer}>
                                    <View style={styles.foundUserInfo}>
                                        <View style={styles.foundUserAvatar}>
                                            <Text style={styles.foundUserAvatarText}>{foundUser.displayName.charAt(0).toUpperCase()}</Text>
                                        </View>
                                        <View>
                                            <Text style={styles.foundUserName}>{foundUser.displayName}</Text>
                                            <Text style={styles.foundUserRole}>{foundUser.role.charAt(0).toUpperCase() + foundUser.role.slice(1)}</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.connectBtn}
                                        onPress={() => handleInvite(foundUser.email)}
                                        disabled={loading}
                                    >
                                        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.connectBtnText}>Connect</Text>}
                                    </TouchableOpacity>
                                </View>
                            )}

                            <Text style={styles.infoText}>
                                Ask your teacher or parent for their code.
                            </Text>
                        </>
                    )}
                </View>

                {/* Linked Parents List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Parents / Guardians</Text>
                    {linkedParents.length > 0 ? (
                        linkedParents.map(parent => (
                            <View key={parent.uid} style={styles.userCard}>
                                <View style={styles.userInfo}>
                                    <View style={[styles.dot, { backgroundColor: '#FF9800' }]} />
                                    <View>
                                        <Text style={styles.userName}>{parent.displayName}</Text>
                                        <Text style={styles.userEmail}>{parent.email}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity onPress={() => handleUnlink(parent)} style={styles.iconBtn}>
                                    <MaterialCommunityIcons name="link-variant-off" size={20} color="#666" />
                                </TouchableOpacity>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="account-group-outline" size={32} color="#FF9800" />
                            <Text style={[styles.emptyText, { color: '#FF9800' }]}>No parents/guardians linked yet</Text>
                        </View>
                    )}
                </View>

                {/* Linked Teachers List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Teachers</Text>
                    {linkedTeachers.length > 0 ? (
                        linkedTeachers.map(teacher => (
                            <View key={teacher.uid} style={styles.userCard}>
                                <View style={styles.userInfo}>
                                    <View style={[styles.dot, { backgroundColor: '#2196F3' }]} />
                                    <View>
                                        <Text style={styles.userName}>{teacher.displayName}</Text>
                                        <Text style={styles.userEmail}>{teacher.email}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity onPress={() => handleUnlink(teacher)} style={styles.iconBtn}>
                                    <MaterialCommunityIcons name="link-variant-off" size={20} color="#666" />
                                </TouchableOpacity>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="school-outline" size={32} color="#FF9800" />
                            <Text style={[styles.emptyText, { color: '#FF9800' }]}>No teachers linked yet</Text>
                        </View>
                    )}
                </View>

            </ScrollView>

            <Modal visible={showCopiedModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <MaterialCommunityIcons name="check-circle" size={40} color="#35c128" />
                        <Text style={styles.modalText}>Copied!</Text>

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

            <CustomAlert
                visible={successAlert.visible}
                title="Success"
                message={successAlert.message}
                onClose={() => {
                    setSuccessAlert(prev => ({ ...prev, visible: false }));
                    if (successAlert.onOk) successAlert.onOk();
                }}
                buttons={[
                    {
                        text: "OK",
                        onPress: () => {
                            setSuccessAlert(prev => ({ ...prev, visible: false }));
                            if (successAlert.onOk) successAlert.onOk();
                        }
                    }
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, marginBottom: 10 },
    title: { fontSize: 28, fontWeight: 'bold', color: 'white', marginLeft: 15 },

    content: { padding: 20, paddingBottom: 50 },

    section: { marginBottom: 30 },
    sectionTitle: { fontSize: 13, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 15, fontWeight: '600' },

    userCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e1e1e', padding: 16, borderRadius: 12, marginBottom: 10 },
    userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    userName: { color: 'white', fontWeight: '600', fontSize: 16 },
    userEmail: { color: '#aaa', fontSize: 13, marginTop: 2 },
    iconBtn: { padding: 8 },

    emptyState: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderStyle: 'dashed', borderWidth: 1, borderColor: '#333', borderRadius: 12, justifyContent: 'center' },
    emptyText: { color: '#666', fontSize: 14 },

    // Inherited Card Style for Invite
    card: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 16, marginBottom: 30 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
    cardTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },

    label: { color: '#bbb', marginBottom: 8, fontSize: 14 },
    input: { backgroundColor: '#252525', color: 'white', padding: 16, borderRadius: 12, fontSize: 16, marginBottom: 20 },

    btn: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 12, alignItems: 'center' },
    btnDisabled: { opacity: 0.7 },
    btnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },



    infoText: { color: '#666', fontSize: 13, textAlign: 'center', marginTop: 15 },

    // My Code Section
    myCodeContainer: { backgroundColor: '#1e1e1e', padding: 20, borderRadius: 16, marginBottom: 30, alignItems: 'center' },
    myCodeLabel: { fontSize: 14, fontWeight: '600', color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    myCodeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#252525', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
    myCodeText: { fontSize: 24, fontWeight: 'bold', letterSpacing: 4, color: '#35c128' },
    copyIcon: { marginLeft: 5 },

    // Toggle Styles
    toggleContainer: { flexDirection: 'row', backgroundColor: '#252525', borderRadius: 8, padding: 4, marginBottom: 20 },
    toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 6 },
    toggleBtnActive: { backgroundColor: '#333' },
    toggleText: { color: '#888', fontWeight: '600', fontSize: 13 },
    toggleTextActive: { color: '#35c128' },

    // Code Search Styles
    codeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    searchBtn: { backgroundColor: '#2E7D32', width: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },

    // Found User Styles
    foundUserContainer: { backgroundColor: '#252525', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, borderWidth: 1, borderColor: '#444' },
    foundUserInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    foundUserAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2E7D32', justifyContent: 'center', alignItems: 'center' },
    foundUserAvatarText: { color: 'white', fontWeight: 'bold' },
    foundUserName: { color: 'white', fontWeight: 'bold', fontSize: 15 },
    foundUserRole: { color: '#888', fontSize: 12 },
    connectBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    connectBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 16, alignItems: 'center', width: '80%', borderWidth: 1, borderColor: '#333' },
    modalText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 10, marginBottom: 20 },

    modalButtons: { flexDirection: 'row', gap: 15, width: '100%', justifyContent: 'center' },
    modalBtnPrimary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2E7D32', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 12 },
    modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    modalBtnSecondary: { paddingVertical: 12, paddingHorizontal: 25, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
    modalBtnTextSec: { color: '#fff', fontWeight: '600', fontSize: 16 },
});

import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Modal, Share } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../services/auth/AuthContext';
import { db } from '../../../services/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { sendInvite, unlinkUser, getUserByInviteCode, getPendingInvites, acceptInvite, rejectInvite } from '../../../services/invites';
import { User, Invite } from '../../../types/schema';
import * as Clipboard from 'expo-clipboard';
import { CustomAlert } from '../../../components/CustomAlert';

export default function LinkStudentScreen() {
    const { user, userProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    // Code Search State
    const [searchMethod, setSearchMethod] = useState<'email' | 'code'>('email');
    const [inviteCode, setInviteCode] = useState('');
    const [foundUser, setFoundUser] = useState<User | null>(null);
    const [searching, setSearching] = useState(false);
    const [showCopiedModal, setShowCopiedModal] = useState(false);

    // Custom Alert State
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
        buttons?: { text: string; onPress: () => void; style?: 'cancel' | 'destructive' | 'default' }[];
    }>({ visible: false, title: '', message: '' });

    const [linkedStudents, setLinkedStudents] = useState<any[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);

    useEffect(() => {
        if (user) {
            fetchLinkedStudents();
            fetchInvites();
        }
    }, [user, userProfile]);

    const fetchLinkedStudents = async () => {
        if (!user || user.uid === 'test-user-123') return;
        try {
            // Find students who have this parent in their linkedParents array
            // Optimization: We could rely on userProfile.linkedStudents if we maintain that, 
            // but standard is usually querying the "many" side or the "users" collection.
            // Let's query users where `linkedParents` contains `user.uid` AND role is student.
            const q = query(
                collection(db, 'users'),
                where('role', '==', 'student'),
                where('linkedParents', 'array-contains', user.uid)
            );
            const snap = await getDocs(q);
            setLinkedStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
        } catch (e) {
            console.log("Error fetching linked students", e);
        }
    };

    const fetchInvites = async () => {
        if (!user) return;
        try {
            const list = await getPendingInvites(user.email!);
            setInvites(list);
        } catch (e) {
            console.log("Error fetching invites", e);
        }
    };

    const handleUnlink = (student: any) => {
        setAlertState({
            visible: true,
            title: "Unlink Student",
            message: `Are you sure you want to remove ${student.displayName}?`,
            buttons: [
                { text: "Cancel", style: "cancel", onPress: () => setAlertState(prev => ({ ...prev, visible: false })) },
                {
                    text: "Remove",
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setAlertState(prev => ({ ...prev, visible: false }));
                            await unlinkUser(user!.uid, student.uid); // Unlink (parent, student)
                            setLinkedStudents(prev => prev.filter(s => s.uid !== student.uid));
                        } catch (e) {
                            setAlertState({ visible: true, title: "Error", message: "Could not unlink student." });
                        }
                    }
                }
            ]
        });
    };

    const handleCodeSearch = async () => {
        if (!inviteCode.trim()) return;
        setSearching(true);
        setFoundUser(null);
        try {
            const u = await getUserByInviteCode(inviteCode.trim());
            if (u) {
                if (u.role !== 'student') {
                    setAlertState({ visible: true, title: "Invalid User", message: "You can only connect with Students." });
                } else if (u.uid === user?.uid) {
                    setAlertState({ visible: true, title: "That's you!", message: "You cannot invite yourself." });
                } else {
                    setFoundUser(u);
                }
            } else {
                setAlertState({ visible: true, title: "Not Found", message: "No student found with this code." });
            }
        } catch (e) {
            console.error(e);
            setAlertState({ visible: true, title: "Error", message: "Search failed." });
        } finally {
            setSearching(false);
        }
    };

    const handleInvite = async (emailOverride?: string) => {
        const targetEmail = emailOverride || email;

        if (!targetEmail.trim()) {
            setAlertState({ visible: true, title: "Error", message: "Please enter an email address." });
            return;
        }

        setLoading(true);
        try {
            if (!user) throw new Error("Not authenticated");
            const cleanEmail = targetEmail.trim().toLowerCase();

            // 1. Check User Existence
            const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
            const snap = await getDocs(q);

            if (snap.empty) {
                throw new Error("Student with this email not found.");
            }

            const targetUser = snap.docs[0].data();
            if (targetUser.role !== 'student') {
                throw new Error("This user is not a student.");
            }

            // 2. Send Invite
            await sendInvite(user as any, cleanEmail, 'parent_to_student');

            setAlertState({
                visible: true,
                title: "Success",
                message: `Invite sent to student (${cleanEmail})!`,
                buttons: [
                    {
                        text: "OK",
                        onPress: () => {
                            setAlertState(prev => ({ ...prev, visible: false }));
                            setEmail('');
                            setInviteCode('');
                            setFoundUser(null);
                        }
                    }
                ]
            });

        } catch (e: any) {
            setAlertState({ visible: true, title: "Error", message: e.message || "Failed to send invite." });
        } finally {
            setLoading(false);
        }
    };

    const handleShare = async () => {
        if (!userProfile?.inviteCode) return;
        try {
            await Share.share({
                message: `Connect with me on Echolearn! Use my invite code: ${userProfile.inviteCode}`,
                title: 'Echolearn Key'
            });
        } catch (error) {
            console.error(error);
        }
    };

    // Invite Actions
    const onAccept = async (invite: Invite) => {
        try {
            await acceptInvite(invite, user!.uid);
            fetchInvites();
            fetchLinkedStudents();
            setAlertState({ visible: true, title: "Success", message: "Connected successfully!" });
        } catch (e: any) {
            setAlertState({ visible: true, title: "Error", message: e.message });
        }
    };
    const onReject = (invite: Invite) => {
        setAlertState({
            visible: true,
            title: "Decline Invitation",
            message: "Are you sure you want to decline this invite?",
            buttons: [
                { text: "Cancel", style: "cancel", onPress: () => setAlertState(prev => ({ ...prev, visible: false })) },
                {
                    text: "Decline",
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setAlertState(prev => ({ ...prev, visible: false }));
                            await rejectInvite(invite.id);
                            fetchInvites();
                        } catch (e: any) {
                            setAlertState({ visible: true, title: "Error", message: e.message });
                        }
                    }
                }
            ]
        });
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="white" />
                </TouchableOpacity>
                <Text style={styles.title}>Link Student</Text>
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

                {/* Invite Section */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="account-plus" size={20} color="#35c128" />
                        <Text style={styles.cardTitle}>Add New Student</Text>
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
                            <Text style={styles.label}>Enter Student Email</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="student@example.com"
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
                                            <Text style={styles.foundUserRole}>Student</Text>
                                        </View>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.connectBtn}
                                        onPress={() => handleInvite(foundUser.email)}
                                        disabled={loading}
                                    >
                                        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.connectBtnText}>Invite</Text>}
                                    </TouchableOpacity>
                                </View>
                            )}

                            <Text style={styles.infoText}>
                                Ask your child for their code (found in their profile).
                            </Text>
                        </>
                    )}
                </View>

                {/* Pending Invites */}
                {invites.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Pending Requests</Text>
                        {invites.map(invite => (
                            <View key={invite.id} style={styles.inviteCard}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.inviteText}>{invite.fromName}</Text>
                                    <Text style={styles.inviteSub}>{invite.type === 'student_to_parent' ? 'Student Request' : 'Invite'}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TouchableOpacity onPress={() => onReject(invite)} style={[styles.actionBtn, { backgroundColor: '#F44336' }]}>
                                        <MaterialCommunityIcons name="close" size={20} color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => onAccept(invite)} style={styles.actionBtn}>
                                        <Text style={styles.actionBtnText}>Accept</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Linked Students List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Enrolled Students</Text>
                    {linkedStudents.length > 0 ? (
                        linkedStudents.map(student => (
                            <View key={student.uid} style={styles.userCard}>
                                <View style={styles.userInfo}>
                                    <View style={[styles.dot, { backgroundColor: '#FF9800' }]} />
                                    <View>
                                        <Text style={styles.userName}>{student.displayName}</Text>
                                        <Text style={styles.userEmail}>{student.email}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity onPress={() => handleUnlink(student)} style={styles.iconBtn}>
                                    <MaterialCommunityIcons name="link-variant-off" size={20} color="#666" />
                                </TouchableOpacity>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="school-outline" size={32} color="#FF9800" />
                            <Text style={[styles.emptyText, { color: '#FF9800' }]}>No students linked yet</Text>
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
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                onClose={() => setAlertState(prev => ({ ...prev, visible: false }))}
                buttons={alertState.buttons || [
                    {
                        text: "OK",
                        onPress: () => setAlertState(prev => ({ ...prev, visible: false }))
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

    // Invite Card (Pending)
    inviteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#2196F3' },
    inviteText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    inviteSub: { color: '#aaa', fontSize: 12 },
    actionBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
    actionBtnText: { color: 'white', fontWeight: 'bold' },

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

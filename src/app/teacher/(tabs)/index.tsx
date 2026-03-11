import { useEffect, useState } from 'react';
import { useAuth } from '../../../services/auth/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getPendingInvites, acceptInvite, rejectInvite } from '../../../services/invites';
import { Invite, Page } from '../../../types/schema';
import { calculateRetrievability } from '../../../services/sm18/algorithm';
import NotificationsModal from '../../../components/NotificationsModal';
import { useNotifications } from '../../../hooks/useNotifications';
import { CustomAlert } from '../../../components/CustomAlert';
import SettingsDropdown from '../../../components/SettingsDropdown';

export default function TeacherDashboard() {
    const { user } = useAuth();
    const [students, setStudents] = useState<any[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showEmptyStateModal, setShowEmptyStateModal] = useState(false);
    const [declineAlert, setDeclineAlert] = useState<{ visible: boolean, invite: Invite | null }>({ visible: false, invite: null });
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const { notifications, unreadCount, markAllAsRead, markAsRead, deleteNotification } = useNotifications(user?.uid);

    useEffect(() => {
        if (user) {
            fetchStudents();
            fetchInvites();
        }
    }, [user]);

    // Show empty state prompt if no students after loading
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (!loading && students.length === 0) {
            timer = setTimeout(() => {
                setShowEmptyStateModal(true);
            }, 1000);
        }
        return () => clearTimeout(timer);
    }, [loading, students.length]);

    const fetchInvites = async () => {
        if (!user) return;
        try {
            const list = await getPendingInvites(user.email!);
            setInvites(list);
        } catch (e) {
            console.log("Error fetching invites", e);
        }
    };

    const fetchStudents = async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, 'users'),
                where('role', '==', 'student'),
                where('linkedTeachers', 'array-contains', user.uid)
            );
            const snap = await getDocs(q);
            let studentList = snap.docs.map(d => ({ ...d.data(), uid: d.id, status: 'active', avgRetention: 0.0 }));

            const studentsWithMetrics = await Promise.all(studentList.map(async (student: any) => {
                try {
                    const qPages = query(collection(db, 'pages'), where('ownerId', '==', student.uid), where('isCompleted', '==', true));
                    const snapPages = await getDocs(qPages);
                    const allPages = snapPages.docs.map(d => d.data() as Page);

                    // Filter to only pages visible to this teacher
                    // Only count pages where teacher is explicitly involved
                    const visiblePages = allPages.filter(p => {
                        // Teacher-managed pages
                        if (p.managedBy === user.uid) return true;
                        // Pages explicitly shared with this teacher
                        if (p.sharedWith && p.sharedWith.includes(user.uid)) return true;
                        return false;
                    });

                    let avg = 0;
                    if (visiblePages.length > 0) {
                        const sum = visiblePages.reduce((acc, p) => acc + calculateRetrievability({
                            lastReviewDate: p.completedAt,
                            interval: p.interval,
                            retentionTarget: p.retentionTarget
                        }), 0);
                        avg = sum / visiblePages.length;
                    }
                    return { ...student, avgRetention: avg };
                } catch (e) {
                    console.log(`Error calculating stats for ${student.uid}`, e);
                    return student;
                }
            }));

            setStudents(studentsWithMetrics);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const onAcceptInvite = async (invite: Invite) => {
        try {
            await acceptInvite(invite, user!.uid);
            fetchInvites();
            fetchStudents();
        } catch (e) {
            console.log("Error accepting invite", e);
        }
    };

    const onRejectInvite = (invite: Invite) => {
        setDeclineAlert({ visible: true, invite });
    };

    const handleConfirmReject = async () => {
        if (!declineAlert.invite) return;
        try {
            await rejectInvite(declineAlert.invite.id);
            fetchInvites();
        } catch (e) {
            console.log("Error rejecting invite", e);
        } finally {
            setDeclineAlert({ visible: false, invite: null });
        }
    };

    const renderStudent = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/teacher/student/${item.uid}`)}
        >
            <View style={styles.row}>
                <View style={[styles.avatar, { backgroundColor: '#333' }]}>
                    <Text style={styles.avatarText}>{item.displayName?.charAt(0) || 'S'}</Text>
                </View>
                <View style={styles.info}>
                    <Text style={styles.name}>{item.displayName || 'Unnamed Student'}</Text>
                    <View style={styles.statusRow}>
                        <Text style={[styles.statusText, { color: '#aaa' }]}>{item.status?.toUpperCase() || 'ACTIVE'}</Text>
                    </View>
                </View>
                <View style={styles.metric}>
                    <Text style={styles.metricVal}>{Math.round((item.avgRetention || 0) * 100)}%</Text>
                    <Text style={styles.metricLabel}>Retention</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                        <Text style={styles.title}>Hello, {user?.displayName?.split(' ')[0] || 'Teacher'}!</Text>
                        <Text style={styles.subtitle}>Ready to inspire today?</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 0 }}>
                        <TouchableOpacity
                            onPress={() => setShowNotifications(true)}
                            style={{ padding: 10 }}
                        >
                            <MaterialCommunityIcons name="bell" size={24} color="#aaa" />
                            {unreadCount > 0 && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{unreadCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('/teacher/link-students')} style={{ backgroundColor: '#1e1e1e', padding: 10, borderRadius: 20 }}>
                            <MaterialCommunityIcons name="account-group" size={24} color="#35c128" />
                        </TouchableOpacity>

                        {/* Settings Dropdown */}
                        <SettingsDropdown />
                    </View>
                </View>
            </View>

            <NotificationsModal
                visible={showNotifications}
                onClose={() => setShowNotifications(false)}
                notifications={notifications}
                onDelete={deleteNotification}
                onMarkAsRead={markAsRead}
                userRole="teacher"
            />

            {/* Pending Invites Section */}
            {invites.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                    <Text style={styles.sectionTitle}>Pending Invites</Text>
                    {invites.map(invite => (
                        <View key={invite.id} style={styles.inviteCard}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.inviteText}>{invite.fromName}</Text>
                                <Text style={styles.inviteSub}>Student Request</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TouchableOpacity onPress={() => onRejectInvite(invite)} style={[styles.acceptBtn, { backgroundColor: '#F44336' }]}>
                                    <MaterialCommunityIcons name="close" size={20} color="white" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => onAcceptInvite(invite)} style={styles.acceptBtn}>
                                    <Text style={styles.acceptBtnText}>Accept</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {loading ? <ActivityIndicator size="large" color="#35c128" /> : (
                <>
                    {students.length > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 20 }}>
                            <Text style={styles.sectionTitle}>My Classroom</Text>
                            <Text style={styles.sectionSubtitle}>
                                {students.length} Student{students.length !== 1 ? 's' : ''} Enrolled
                            </Text>
                        </View>
                    )}
                    <FlatList
                        data={students}
                        renderItem={renderStudent}
                        keyExtractor={item => item.uid}
                        contentContainerStyle={styles.list}
                    />
                </>
            )}

            {/* Empty State Modal */}
            <Modal visible={showEmptyStateModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <MaterialCommunityIcons name="account-group-outline" size={50} color="#35c128" />
                        <Text style={styles.modalTitle}>Start Your Classroom</Text>
                        <Text style={styles.modalSub}>Link with your students to track their progress and share notebooks.</Text>

                        <TouchableOpacity
                            style={styles.modalBtnPrimary}
                            onPress={() => {
                                setShowEmptyStateModal(false);
                                router.push('/teacher/link-students');
                            }}
                        >
                            <Text style={styles.modalBtnText}>Connect with Students</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.modalBtnSecondary}
                            onPress={() => setShowEmptyStateModal(false)}
                        >
                            <Text style={styles.modalBtnTextSec}>Dismiss</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <CustomAlert
                visible={declineAlert.visible}
                title="Decline Invitation"
                message="Are you sure you want to decline this student request?"
                onClose={() => setDeclineAlert({ visible: false, invite: null })}
                buttons={[
                    {
                        text: "Cancel",
                        onPress: () => setDeclineAlert({ visible: false, invite: null }),
                        style: "cancel"
                    },
                    {
                        text: "Decline",
                        onPress: handleConfirmReject,
                        style: "destructive"
                    }
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { paddingHorizontal: 20, paddingBottom: 10 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
    subtitle: { fontSize: 16, color: '#aaa', marginTop: 5 },

    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginLeft: 20, marginTop: 20, marginBottom: 5 },
    sectionSubtitle: { fontSize: 13, color: '#aaa', marginBottom: 8 },

    list: { padding: 15 },
    card: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15, marginBottom: 10 },
    row: { flexDirection: 'row', alignItems: 'center' },

    avatar: { width: 45, height: 45, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    avatarText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },

    info: { flex: 1 },
    name: { fontSize: 16, fontWeight: '600', color: '#fff' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    statusText: { fontSize: 12, fontWeight: 'bold' },

    metric: { alignItems: 'center', marginRight: 10 },
    metricVal: { fontSize: 18, fontWeight: 'bold', color: '#35c128' },
    metricLabel: { fontSize: 10, color: '#aaa' },

    inviteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginHorizontal: 20, marginBottom: 10 },
    inviteText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    inviteSub: { color: '#aaa', fontSize: 12 },
    acceptBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
    acceptBtnText: { color: 'white', fontWeight: 'bold' },

    badge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'red', borderRadius: 10, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1e1e1e', padding: 25, borderRadius: 16, alignItems: 'center', width: '85%', borderWidth: 1, borderColor: '#333', elevation: 10 },
    modalTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 15, marginBottom: 10 },
    modalSub: { color: '#aaa', fontSize: 16, textAlign: 'center', marginBottom: 25, lineHeight: 22 },
    modalBtnPrimary: { backgroundColor: '#2E7D32', paddingVertical: 14, width: '100%', borderRadius: 12, alignItems: 'center', marginBottom: 12 },
    modalBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    modalBtnSecondary: { paddingVertical: 12, width: '100%', alignItems: 'center' },
    modalBtnTextSec: { color: '#888', fontWeight: '600', fontSize: 14 }
});

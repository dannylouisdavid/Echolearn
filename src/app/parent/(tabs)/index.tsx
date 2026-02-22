import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useAuth } from '../../../services/auth/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotifications } from '../../../hooks/useNotifications';
import NotificationsModal from '../../../components/NotificationsModal';
import { getPendingInvites, acceptInvite, rejectInvite } from '../../../services/invites';
import { Invite } from '../../../types/schema';
import { formatRetrievability } from '../../../services/sm18/algorithm';
import { CustomAlert } from '../../../components/CustomAlert';
import SettingsDropdown from '../../../components/SettingsDropdown';

/* 
  Parent Dashboard
  - Detailed Cards for each child 
*/

interface ChildSummary {
    uid: string;
    displayName: string;
    photoURL?: string;
    avgRetention?: number;
    timeToday?: number; // minutes
    lastActive?: number;
    topicsToday?: number;
    totalTopics?: number;
}

export default function ParentDashboard() {
    const { userProfile, user, refreshProfile } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [children, setChildren] = useState<ChildSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Invites
    const [invites, setInvites] = useState<Invite[]>([]);
    const [declineAlert, setDeclineAlert] = useState<{ visible: boolean, invite: Invite | null }>({ visible: false, invite: null });

    // Notifications
    const { notifications, unreadCount, markAllAsRead, markAsRead, deleteNotification } = useNotifications(user?.uid);
    const [showNotifications, setShowNotifications] = useState(false);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchChildren(),
                fetchInvites()
            ]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
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

    const fetchChildren = async () => {
        if (!userProfile?.linkedStudents || userProfile.linkedStudents.length === 0) {
            setChildren([]);
            return;
        }

        const students: ChildSummary[] = [];
        // 1. Fetch Basic Info
        const studentPromises = userProfile.linkedStudents.map(uid => getDoc(doc(db, 'users', uid)));
        const studentSnaps = await Promise.all(studentPromises);

        for (const snap of studentSnaps) {
            if (!snap.exists()) continue;
            const data = snap.data();
            const uid = snap.id;

            // 2. Fetch Aggregated Stats
            let avgRetention = 0;
            let timeToday = 0;
            let topicsToday = 0;
            let totalTopics = 0;
            let lastActive = 0;

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

            // Fetch Notebooks to determine access
            const notebooksQ = query(collection(db, 'notebooks'), where('ownerId', '==', uid));
            const notebooksSnap = await getDocs(notebooksQ);

            // Set of Notebook IDs visible to this parent
            const allowedNotebookIds = new Set<string>();
            notebooksSnap.forEach(nb => {
                const nbData = nb.data();
                // Check if shared with this parent
                if (nbData.sharedWithParents && nbData.sharedWithParents.includes(user!.uid)) {
                    allowedNotebookIds.add(nb.id);
                }
            });

            const pagesQ = query(
                collection(db, 'pages'),
                where('ownerId', '==', uid)
            );
            const pagesSnap = await getDocs(pagesQ);

            let retentionSum = 0;
            let retentionCount = 0;
            let maxDate = 0;

            pagesSnap.forEach(p => {
                const pData = p.data();

                // Only include if notebook is allowed
                if (!allowedNotebookIds.has(pData.notebookId)) return;

                const activeAt = pData.completedAt || pData.updatedAt || pData.createdAt || 0;

                // Time Today
                if (activeAt >= startOfDay) {
                    timeToday += (pData.actualTimeMinutes || 0);
                    if (pData.isCompleted) topicsToday++;
                }

                if (pData.isCompleted) totalTopics++;

                if (activeAt > maxDate) maxDate = activeAt;

                if (pData.rFactor) {
                    retentionSum += (pData.difficultyRating || 0.9);
                    retentionCount++;
                }
            });

            avgRetention = retentionCount > 0 ? (retentionSum / retentionCount) : 0;
            lastActive = maxDate;

            students.push({
                uid,
                displayName: data.displayName || 'Student',
                photoURL: data.photoURL,
                avgRetention,
                timeToday, // Minutes
                lastActive,
                topicsToday,
                totalTopics
            });
        }
        setChildren(students);
    };

    const onAcceptInvite = async (invite: Invite) => {
        try {
            await acceptInvite(invite, user!.uid);
            Alert.alert("Success", "Connected successfully!");
            await refreshProfile(); // Refresh profile to get updated linkedStudents
            fetchDashboardData();
        } catch (e: any) {
            Alert.alert("Error", e.message || "Could not accept invite.");
        }
    };

    const onRejectInvite = (invite: Invite) => {
        setDeclineAlert({ visible: true, invite });
    };

    const handleConfirmReject = async () => {
        if (!declineAlert.invite) return;
        try {
            await rejectInvite(declineAlert.invite.id);
            fetchDashboardData();
        } catch (e: any) {
            Alert.alert("Error", e.message || "Could not decline invite.");
        } finally {
            setDeclineAlert({ visible: false, invite: null });
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchDashboardData();
        }, [userProfile])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchDashboardData();
    };

    const formatTime = (mins: number) => {
        if (mins < 60) return `${mins}m`;
        return `${(mins / 60).toFixed(1)}h`;
    };

    if (loading && !refreshing) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#121212' }}>
                <ActivityIndicator size="large" color="#35c128" />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#121212' }}>
            <ScrollView
                style={[styles.container, { paddingTop: insets.top + 20 }]}
                contentContainerStyle={{ paddingBottom: 50, flexGrow: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#35c128" />}
            >
                <View style={styles.header}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.greeting}>Hello, {user?.displayName?.split(' ')[0] || 'Guardian'}!</Text>
                            <Text style={styles.subGreeting}>Ready to guide?</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                            <TouchableOpacity onPress={() => setShowNotifications(true)} style={{ padding: 10 }}>
                                <MaterialCommunityIcons name="bell" size={24} color="#aaa" />
                                {unreadCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{unreadCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            {/* Settings Dropdown */}
                            <SettingsDropdown />
                        </View>
                    </View>
                </View>

                {/* Pending Invites Section */}
                {invites.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Pending Invites</Text>
                        {invites.map(invite => (
                            <View key={invite.id} style={styles.inviteCard}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.inviteText}>{invite.fromName}</Text>
                                    <Text style={styles.inviteSub}>{invite.type === 'student_to_parent' ? 'Student Request' : 'Invite'}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <TouchableOpacity onPress={() => onRejectInvite(invite)} style={[styles.actionBtn, { backgroundColor: '#F44336' }]}>
                                        <MaterialCommunityIcons name="close" size={20} color="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => onAcceptInvite(invite)} style={styles.actionBtn}>
                                        <Text style={styles.actionBtnText}>Accept</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {children.length === 0 ? (
                    <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="account-group-outline" size={60} color="#333" />
                        <Text style={styles.emptyText}>No students linked yet.</Text>
                        <TouchableOpacity
                            style={styles.linkBtn}
                            onPress={() => router.push('/parent/(tabs)/link-student')}
                        >
                            <Text style={styles.linkBtnText}>Link a Student</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.list}>
                        <Text style={styles.sectionTitle}>My Students</Text>
                        {children.map(child => (
                            <TouchableOpacity
                                key={child.uid}
                                style={styles.card}
                                onPress={() => router.push({ pathname: '/parent/student/[id]', params: { id: child.uid, name: child.displayName } })}
                            >
                                <View style={styles.cardHeader}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{child.displayName[0]}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.name}>{child.displayName}</Text>
                                        <Text style={styles.retentionBig}>
                                            {child.avgRetention ? formatRetrievability(child.avgRetention) : '--'}
                                            <Text style={styles.retentionLabel}> Avg. Retention</Text>
                                        </Text>
                                    </View>
                                    <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
                                </View>

                                <View style={styles.statsRow}>
                                    <View style={styles.stat}>
                                        <Text style={styles.statVal}>{formatTime(child.timeToday || 0)}</Text>
                                        <Text style={styles.statLabel}>Time Today</Text>
                                    </View>
                                    <View style={[styles.stat, { borderLeftWidth: 1, borderLeftColor: '#333' }]}>
                                        <Text style={styles.statVal}>{child.topicsToday || 0}</Text>
                                        <Text style={styles.statLabel}>Topics Today</Text>
                                    </View>
                                    <View style={[styles.stat, { borderLeftWidth: 1, borderLeftColor: '#333' }]}>
                                        <Text style={styles.statVal}>{child.totalTopics || 0}</Text>
                                        <Text style={styles.statLabel}>Total Topics</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </ScrollView>

            <NotificationsModal
                visible={showNotifications}
                onClose={() => setShowNotifications(false)}
                notifications={notifications}
                onDelete={deleteNotification}
                onMarkAsRead={markAsRead}
            />

            <CustomAlert
                visible={declineAlert.visible}
                title="Decline Invitation"
                message="Are you sure you want to decline this invitation?"
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
    container: { flex: 1, padding: 20 },
    header: { marginBottom: 30 },
    greeting: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
    subGreeting: { fontSize: 14, color: '#aaa', marginTop: 5 },

    sectionContainer: { marginBottom: 25 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 15 },

    inviteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#2196F3' },
    inviteText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    inviteSub: { color: '#aaa', fontSize: 12 },
    actionBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
    actionBtnText: { color: 'white', fontWeight: 'bold' },

    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
    emptyText: { color: '#666', marginTop: 15, fontSize: 16 },
    linkBtn: { marginTop: 20, backgroundColor: '#2E7D32', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    linkBtnText: { color: 'white', fontWeight: 'bold' },

    list: { gap: 15 },
    card: { backgroundColor: '#1e1e1e', borderRadius: 16, padding: 20, marginBottom: 15 },

    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 15 }, // Reduced bottom margin
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#35c128', fontSize: 20, fontWeight: 'bold' },
    name: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    retentionBig: { color: '#35c128', fontSize: 24, fontWeight: 'bold', marginTop: 2 },
    retentionLabel: { color: '#888', fontSize: 14, fontWeight: 'normal' },

    statsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#333', paddingTop: 15 },
    stat: { flex: 1, alignItems: 'center' },
    statVal: { color: '#fff', fontSize: 16, fontWeight: 'bold' }, // White allows green retention to pop
    statLabel: { color: '#666', fontSize: 12, marginTop: 2 },

    badge: { position: 'absolute', top: 5, right: 5, backgroundColor: 'red', borderRadius: 10, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' }
});

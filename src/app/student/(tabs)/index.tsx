import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, ActivityIndicator, Animated } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useAuth } from '../../../services/auth/AuthContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, query, where, getDocs, orderBy, doc, getDoc, limit } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { generateExamQuestions } from '../../../services/ai/gemini';
import { calculateRetrievability, formatRetrievability } from '../../../services/sm18/algorithm';
import { getPendingInvites, acceptInvite, rejectInvite, sendInvite } from '../../../services/invites';
import { Invite, Page } from '../../../types/schema';
import NotificationsModal from '../../../components/NotificationsModal';
import { useNotifications } from '../../../hooks/useNotifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingsDropdown from '../../../components/SettingsDropdown';
import WeeklyProgressChart from '../../../components/WeeklyProgressChart';

import { CustomAlert } from '../../../components/CustomAlert';

export default function StudentDashboard() {
    const { user, userProfile, mockPages } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Dashboard Stats
    const [completedTopics, setCompletedTopics] = useState(0); // Today
    const [totalTime, setTotalTime] = useState(0); // Today
    const [averageRetention, setAverageRetention] = useState<number | null>(null); // Today
    const [weeklyData, setWeeklyData] = useState<{ day: string; minutes: number }[]>([]); // Graph Data
    const [pausedSessions, setPausedSessions] = useState<any[]>([]);
    const [dueReviews, setDueReviews] = useState<any[]>([]);

    // Invites & Notifications
    const [invites, setInvites] = useState<Invite[]>([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [declineAlert, setDeclineAlert] = useState<{ visible: boolean, invite: Invite | null }>({ visible: false, invite: null });

    // My Groups
    const [myGroups, setMyGroups] = useState<{ id: string; name: string; teacherName: string }[]>([]);

    // Hook
    const { notifications, unreadCount, markAllAsRead, markAsRead, deleteNotification } = useNotifications(user?.uid);

    // AI Modal
    const [isAIModalVisible, setAIModalVisible] = useState(false);
    const [apiKey, setApiKey] = useState("");
    const [aiLoading, setAiLoading] = useState(false);
    const [generatedQuestions, setGeneratedQuestions] = useState("");
    const [showMetricsModal, setShowMetricsModal] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(scaleAnim, {
                    toValue: 1.2,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(scaleAnim, {
                    toValue: 1,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (user) {
                fetchStats();
                fetchInvites();
                fetchMyGroups();
            }
        }, [user, mockPages])
    );

    const fetchInvites = async () => {
        if (!user || user.uid === 'test-user-123') return;
        try {
            const list = await getPendingInvites(user.email!);
            setInvites(list);
        } catch (e) {
            console.log("Error fetching invites", e);
        }
    };

    const fetchMyGroups = async () => {
        if (!user || user.uid === 'test-user-123') return;
        try {
            // Find groups where this student is a member
            const q = query(
                collection(db, 'groups'),
                where('studentIds', 'array-contains', user.uid)
            );
            const snap = await getDocs(q);

            const groups: { id: string; name: string; teacherName: string }[] = [];
            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                let teacherName = 'Teacher';

                // Get teacher name
                if (data.teacherId) {
                    try {
                        const teacherDoc = await getDoc(doc(db, 'users', data.teacherId));
                        if (teacherDoc.exists()) {
                            teacherName = teacherDoc.data().displayName || 'Teacher';
                        }
                    } catch (e) { }
                }

                groups.push({
                    id: docSnap.id,
                    name: data.name || 'Unnamed Group',
                    teacherName
                });
            }
            setMyGroups(groups);
        } catch (e) {
            console.log("Error fetching groups", e);
        }
    };

    const onAcceptInvite = async (invite: Invite) => {
        try {
            await acceptInvite(invite, user!.uid);
            Alert.alert("Success", "Connected successfully!");
            fetchInvites();
        } catch (e) {
            Alert.alert("Error", "Could not accept invite.");
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
            Alert.alert("Error", "Could not decline invite.");
        } finally {
            setDeclineAlert({ visible: false, invite: null });
        }
    };

    const fetchStats = async () => {
        if (!user) return;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        // Helper
        const calcAvg = (docs: any[]) => {
            if (docs.length === 0) return 0;
            let sum = 0;
            let count = 0;
            docs.forEach(d => {
                const val = calculateRetrievability({
                    lastReviewDate: d.completedAt,
                    interval: d.interval,
                    retentionTarget: d.retentionTarget
                });
                if (!isNaN(val)) {
                    sum += val;
                    count++;
                }
            });
            return count > 0 ? sum / count : 0;
        };

        // DEV BYPASS
        if (user.uid === 'test-user-123') {
            const pages = mockPages || [];

            // Today's Stats
            const todayPages = pages.filter(p => p.updatedAt >= startOfDay);
            const completedToday = todayPages.filter(p => p.isCompleted);
            setCompletedTopics(completedToday.length);
            setTotalTime(todayPages.reduce((acc, p) => acc + (p.actualTimeMinutes || 0), 0));
            setAverageRetention(calcAvg(pages)); // Retention is usually global or based on all active items

            // Weekly Data (Stable Mock)
            const dayMap = new Map<string, number>();
            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                d.setHours(0, 0, 0, 0);
                return d;
            });
            last7Days.forEach(d => dayMap.set(d.toDateString(), 0));

            pages.forEach(p => {
                if (p.updatedAt) {
                    const dDate = new Date(p.updatedAt);
                    dDate.setHours(0, 0, 0, 0);
                    const dateStr = dDate.toDateString();
                    if (dayMap.has(dateStr)) {
                        dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + (p.actualTimeMinutes || 0));
                    }
                }
            });

            const graphData = last7Days.map(date => {
                return {
                    day: date.toLocaleDateString('en-US', { weekday: 'short' }),
                    minutes: dayMap.get(date.toDateString()) || 0
                };
            });
            setWeeklyData(graphData);

            const paused = pages.filter(p => !p.isCompleted && (p.actualTimeMinutes || 0) > 0);
            setPausedSessions(paused);
            return;
        }

        try {
            const q = query(collection(db, 'pages'), where('ownerId', '==', user.uid));
            const snap = await getDocs(q);
            const allDocs = snap.docs.map(d => ({ ...d.data(), id: d.id } as any));

            // Initialize Counters
            let completedTodayCount = 0;
            let totalTimeToday = 0;
            let todayRetentionSum = 0;
            let todayRetentionCount = 0;
            const pausedSessionsList: any[] = [];
            const dueReviewsList: any[] = [];

            // Weekly Graph Init
            const dayMap = new Map<string, number>();
            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                d.setHours(0, 0, 0, 0);
                return d;
            });
            last7Days.forEach(d => dayMap.set(d.toDateString(), 0));

            // Single Pass Loop
            allDocs.forEach(page => {
                // Weekly Graph
                if (page.updatedAt) {
                    const dDate = new Date(page.updatedAt);
                    dDate.setHours(0, 0, 0, 0);
                    const dateStr = dDate.toDateString();
                    if (dayMap.has(dateStr)) {
                        dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + (page.actualTimeMinutes || 0));
                    }
                }

                // Today's Activity
                const isToday = (page.updatedAt && page.updatedAt >= startOfDay) || (page.createdAt && page.createdAt >= startOfDay);
                if (isToday) {
                    if (page.isCompleted) {
                        completedTodayCount++;
                        const retentionVal = calculateRetrievability({
                            lastReviewDate: page.completedAt,
                            interval: page.interval,
                            retentionTarget: page.retentionTarget
                        });
                        if (!isNaN(retentionVal)) {
                            todayRetentionSum += retentionVal;
                            todayRetentionCount++;
                        }
                    }

                    // Time Calculation
                    totalTimeToday += (page.actualTimeMinutes || 0);
                    // Add offline session time
                    if (page.currentSessionStart) {
                        const start = new Date(page.currentSessionStart);
                        const today = new Date();
                        if (start.getDate() === today.getDate() && start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear()) {
                            const elapsed = (Date.now() - page.currentSessionStart) / 60000;
                            totalTimeToday += elapsed;
                        }
                    }
                }

                // Paused Sessions (Active or Inactive but not completed)
                if (!page.isCompleted && (
                    (page.actualTimeMinutes && page.actualTimeMinutes > 0) ||
                    page.currentSessionStart
                )) {
                    // Check if it's already in the list
                    const exists = pausedSessionsList.find(p => p.id === page.id);
                    if (!exists) {
                        pausedSessionsList.push(page);
                    }
                }

                // Due Reviews
                if (page.isCompleted && page.nextReviewDate && page.nextReviewDate <= Date.now()) {
                    dueReviewsList.push(page);
                }
            });

            // Set State
            setCompletedTopics(completedTodayCount);
            setTotalTime(Math.round(totalTimeToday));
            setAverageRetention(todayRetentionCount > 0 ? todayRetentionSum / todayRetentionCount : 0);
            setPausedSessions(pausedSessionsList);
            setDueReviews(dueReviewsList);

            const graphData = last7Days.map(date => ({
                day: date.toLocaleDateString('en-US', { weekday: 'short' }),
                minutes: dayMap.get(date.toDateString()) || 0
            }));
            setWeeklyData(graphData);

        } catch (e) {
            console.log("Fetch stats failed:", e);
        }
    };

    const handleGenerateQuestions = async () => {
        if (!apiKey.trim()) {
            Alert.alert("API Key Required", "Please enter a generic Gemini API Key to test this feature.");
            return;
        }
        setAiLoading(true);
        try {
            const q = query(collection(db, 'pages'), where('ownerId', '==', user!.uid), where('isCompleted', '==', true), orderBy('completedAt', 'desc'));
            const snap = await getDocs(q);
            const topics = snap.docs.map(doc => doc.data().title);

            if (topics.length === 0) {
                Alert.alert("No Topics", "Complete some topics first!");
                setAiLoading(false);
                return;
            }

            const target = (userProfile as any)?.preparationTarget || "General Knowledge";
            const result = await generateExamQuestions(apiKey, target, topics.slice(0, 10));
            setGeneratedQuestions(result);

        } catch (error: any) {
            Alert.alert("AI Error", error.message);
        } finally {
            setAiLoading(false);
        }
    };

    return (
        <View style={styles.safeArea}>
            <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 30 }]}>
                <View style={styles.header}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                            <Text style={styles.greeting}>Hello, {user?.displayName?.split(' ')[0] || 'Student'}!</Text>
                            <Text style={styles.subGreeting}>Ready to learn today?</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                            <TouchableOpacity
                                onPress={() => setShowNotifications(true)}
                                style={{ padding: 5 }}
                            >
                                <MaterialCommunityIcons name="bell" size={24} color="#aaa" />
                                {unreadCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{unreadCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.push('/student/search')} style={{ backgroundColor: '#1e1e1e', padding: 8, borderRadius: 20 }}>
                                <MaterialCommunityIcons name="account-search" size={24} color="#35c128" />
                            </TouchableOpacity>

                            {/* Settings Dropdown */}
                            <SettingsDropdown />
                        </View>
                    </View>

                    <NotificationsModal
                        visible={showNotifications}
                        onClose={() => setShowNotifications(false)}
                        notifications={notifications}
                        onDelete={deleteNotification}
                        onMarkAsRead={markAsRead}
                    />
                </View>


                {/* Dashboard Stats */}
                <View style={[styles.sectionHeader, { justifyContent: 'flex-start', gap: 8 }]}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Today's Progress</Text>
                    <TouchableOpacity onPress={() => setShowMetricsModal(true)}>
                        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                            <MaterialCommunityIcons name="information-outline" size={20} color="#35c128" />
                        </Animated.View>
                    </TouchableOpacity>
                </View>
                <View style={styles.statsContainer}>
                    <View style={[styles.statCard, { width: '31%', padding: 15 }]}>
                        <Text style={[styles.statNumber, { fontSize: 20 }]}>{averageRetention ? formatRetrievability(averageRetention) : '--'}</Text>
                        <Text style={[styles.statLabel, { fontSize: 12 }]}>Retention</Text>
                    </View>
                    <View style={[styles.statCard, { width: '31%', padding: 15 }]}>
                        <Text style={[styles.statNumber, { fontSize: 20 }]}>{completedTopics}</Text>
                        <Text style={[styles.statLabel, { fontSize: 12 }]}>Topics</Text>
                    </View>
                    <View style={[styles.statCard, { width: '31%', padding: 15 }]}>
                        <Text style={[styles.statNumber, { fontSize: 20 }]}>{totalTime}m</Text>
                        <Text style={[styles.statLabel, { fontSize: 12 }]}>Time</Text>
                    </View>
                </View>

                {/* Weekly Graph */}
                <View style={{ marginBottom: 30 }}>
                    <WeeklyProgressChart data={weeklyData} />
                </View>


                {/* Pending Invites Section */}
                {
                    invites.length > 0 && (
                        <View style={styles.sectionContainer}>
                            <Text style={styles.sectionTitle}>Pending Invites</Text>
                            {invites.map(invite => (
                                <View key={invite.id} style={styles.inviteCard}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.inviteText}>{invite.fromName}</Text>
                                        <Text style={styles.inviteSub}>{invite.type === 'teacher_to_student' ? 'Teacher' : 'Student'}</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
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
                    )
                }

                {dueReviews.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Topics Due for Review</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {dueReviews.map((topic, index) => (
                                <TouchableOpacity key={index} style={[styles.pausedCard, { borderLeftColor: '#f44336' }]} onPress={() => router.push(`/student/page/${topic.id}`)}>
                                    <Text style={styles.pausedTitle}>{topic.title}</Text>
                                    <Text style={styles.pausedTime}>Due Now</Text>
                                    <View style={[styles.resumeBtn, { backgroundColor: 'rgba(244, 67, 54, 0.2)' }]}>
                                        <Text style={[styles.resumeText, { color: '#f44336' }]}>REVIEW</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}




                {/* My Groups */}
                {myGroups.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>My Groups</Text>
                        {myGroups.map(group => (
                            <View key={group.id} style={styles.groupCard}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.groupName}>{group.name}</Text>
                                    <Text style={styles.groupTeacher}>{group.teacherName}</Text>
                                </View>
                                <MaterialCommunityIcons name="account-group" size={24} color="#FF9800" />
                            </View>
                        ))}
                    </View>
                )}

                {/* Continue Learning (Paused Sessions) */}
                {pausedSessions.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Continue Learning</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {pausedSessions.map((session, index) => {
                                const isActive = !!session.currentSessionStart;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.pausedCard,
                                            isActive && { borderLeftColor: '#4CAF50', backgroundColor: 'rgba(76, 175, 80, 0.1)' }
                                        ]}
                                        onPress={() => router.push(`/student/page/${session.id}`)}
                                    >
                                        <Text style={styles.pausedTitle} numberOfLines={1}>{session.title}</Text>
                                        <Text style={[styles.pausedTime, isActive && { color: '#4CAF50', fontWeight: 'bold' }]}>
                                            {isActive ? 'Timer Running...' : `${Math.floor(session.actualTimeMinutes || 0)} min spent`}
                                        </Text>
                                        <View style={[
                                            styles.resumeBtn,
                                            isActive && { backgroundColor: '#4CAF50' }
                                        ]}>
                                            <Text style={[
                                                styles.resumeText,
                                                isActive && { color: 'white' }
                                            ]}>
                                                {isActive ? 'ACTIVE' : 'PAUSED'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                {/* AI Modal */}
                <Modal visible={isAIModalVisible} animationType="slide">
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>AI Question Generator</Text>
                            <TouchableOpacity onPress={() => setAIModalVisible(false)}>
                                <MaterialCommunityIcons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.modalBody}>
                            {!generatedQuestions ? (
                                <>
                                    <Text style={styles.label}>Enter Gemini API Key:</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="AIzaSy..."
                                        value={apiKey}
                                        onChangeText={setApiKey}
                                        secureTextEntry
                                    />
                                    <Text style={styles.hint}>Get a free key from Google AI Studio.</Text>

                                    <TouchableOpacity style={styles.generateBtn} onPress={handleGenerateQuestions} disabled={aiLoading}>
                                        {aiLoading ? <ActivityIndicator color="white" /> : <Text style={styles.generateBtnText}>Generate Questions</Text>}
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <ScrollView style={styles.resultContainer}>
                                    <Text style={styles.resultTitle}>Practice Questions:</Text>
                                    <Text style={styles.resultText}>{generatedQuestions}</Text>
                                    <TouchableOpacity style={[styles.generateBtn, { marginTop: 20, backgroundColor: '#666' }]} onPress={() => setGeneratedQuestions("")}>
                                        <Text style={styles.generateBtnText}>Clear / New</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            )}
                        </View>
                    </View>
                </Modal>

                {/* Metrics Modal */}
                <Modal visible={showMetricsModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.metricsModalContainer}>
                            <Text style={styles.metricsTitle}>Metrics Info</Text>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricLabel}>Retention:</Text>
                                <Text style={styles.metricDesc}>Your average memory strength.</Text>
                            </View>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricLabel}>Topics:</Text>
                                <Text style={styles.metricDesc}>Completed topics today.</Text>
                            </View>
                            <View style={styles.metricItem}>
                                <Text style={styles.metricLabel}>Time:</Text>
                                <Text style={styles.metricDesc}>Minutes spent learning today.</Text>
                            </View>
                            <TouchableOpacity
                                style={styles.metricsBtn}
                                onPress={() => setShowMetricsModal(false)}
                            >
                                <Text style={styles.metricsBtnText}>Got it</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </ScrollView >

            <CustomAlert
                visible={declineAlert.visible}
                title="Decline Invitation"
                message={`Are you sure you want to decline the invitation from ${declineAlert.invite?.fromName}?`}
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
        </View >
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#121212' },
    container: { flexGrow: 1, padding: 20 },
    header: { marginBottom: 30 },
    greeting: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
    subGreeting: { fontSize: 16, color: '#aaa', marginTop: 5 },

    rejectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(244, 67, 54, 0.1)', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(244, 67, 54, 0.3)' },
    rejectionText: { flex: 1, color: '#ffcccb', marginLeft: 10, fontSize: 14 },

    badge: { position: 'absolute', top: 0, right: 0, backgroundColor: 'red', borderRadius: 10, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

    inviteCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10 },
    inviteText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    inviteSub: { color: '#aaa', fontSize: 12 },
    acceptBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
    acceptBtnText: { color: 'white', fontWeight: 'bold' },

    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    statsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
    statCard: { width: '48%', backgroundColor: '#1e1e1e', padding: 20, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, elevation: 3 },
    statNumber: { fontSize: 24, fontWeight: 'bold', color: '#35c128' },
    statLabel: { fontSize: 14, color: '#aaa', marginTop: 5 },

    sectionContainer: { marginBottom: 30 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 15 },
    pausedCard: { width: 140, backgroundColor: '#252525', padding: 15, borderRadius: 12, marginRight: 15, borderLeftWidth: 3, borderLeftColor: '#FF9800' },
    pausedTitle: { fontSize: 14, fontWeight: 'bold', color: '#fff', marginBottom: 5 },
    pausedTime: { fontSize: 12, color: '#aaa', marginBottom: 10 },
    resumeBtn: { backgroundColor: 'rgba(255, 152, 0, 0.2)', paddingVertical: 5, borderRadius: 5, alignItems: 'center' },
    resumeText: { color: '#FF9800', fontSize: 12, fontWeight: 'bold' },

    groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#FF9800' },
    groupName: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    groupTeacher: { color: '#aaa', fontSize: 12, marginTop: 2 },
    aiCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2E7D32', padding: 20, borderRadius: 16, shadowColor: '#2E7D32', shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    aiTextContainer: { flex: 1, marginLeft: 15 },
    aiTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },
    aiSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },

    modalContainer: { flex: 1, backgroundColor: '#121212', paddingTop: 50 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    modalBody: { flex: 1, padding: 20 },
    label: { fontSize: 16, marginBottom: 10, fontWeight: '600', color: '#ddd' },
    input: { borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 10, color: '#fff', backgroundColor: '#222' },
    hint: { fontSize: 12, color: '#888', marginBottom: 30 },
    generateBtn: { backgroundColor: '#6200EE', padding: 16, borderRadius: 8, alignItems: 'center' },
    generateBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
    resultContainer: { flex: 1 },
    resultTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#fff' },
    resultText: { fontSize: 16, lineHeight: 24, color: '#ccc' },

    // Metrics Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    metricsModalContainer: { width: '85%', backgroundColor: '#1e1e1e', padding: 25, borderRadius: 12, borderWidth: 1, borderColor: '#333', elevation: 10 },
    metricsTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },
    metricItem: { flexDirection: 'column', marginBottom: 15 },
    metricLabel: { color: '#35c128', fontWeight: 'bold', fontSize: 16, marginBottom: 5 },
    metricDesc: { color: '#ccc', fontSize: 14 },
    metricsBtn: { backgroundColor: '#2E7D32', paddingVertical: 12, borderRadius: 8, marginTop: 10, alignItems: 'center' },
    metricsBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});



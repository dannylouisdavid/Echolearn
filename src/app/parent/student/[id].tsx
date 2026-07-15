import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, SectionList, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../services/auth/AuthContext';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { Page, Notebook } from '../../../types/schema';
import { calculateRetrievability, formatRetrievability } from '../../../services/sm18/algorithm';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AnalyticsDashboard from '../../../components/AnalyticsDashboard';
import TeacherCard from '../../../components/TeacherCard';
import TeacherBioModal from '../../../components/TeacherBioModal';
import ChatInterface from '../../../components/ChatInterface';
import { TeacherProfile } from '../../../types/schema';
import { Modal } from 'react-native';
import { getOrCreateConversation } from '../../../services/messaging';

export default function ParentStudentDetailScreen() {
    const { id, name } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);
    const [avgRetention, setAvgRetention] = useState(0);

    // Teachers & Messaging State
    const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
    const [unreadTeachersCount, setUnreadTeachersCount] = useState(0);
    const [teacherUnreadCounts, setTeacherUnreadCounts] = useState<Record<string, number>>({});
    const [teacherLastMessages, setTeacherLastMessages] = useState<Record<string, string>>({}); // NEW: Store last messages
    const [teacherLastMessageTimes, setTeacherLastMessageTimes] = useState<Record<string, number>>({}); // NEW: Store last message timestamps
    const [selectedTeacher, setSelectedTeacher] = useState<TeacherProfile | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [activeConversationId, setActiveConversationId] = useState('');
    const [chatRecipient, setChatRecipient] = useState<TeacherProfile | null>(null);

    useEffect(() => {
        if (!user || !id) return;

        // Listen to conversations where I am a participant AND it's about this student
        const qConv = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', user.uid),
            where('relatedStudentId', '==', id)
        );

        const unsub = onSnapshot(qConv, (snap) => {
            let total = 0;
            const counts: Record<string, number> = {};
            const msgs: Record<string, string> = {};
            const times: Record<string, number> = {};

            snap.docs.forEach(d => {
                const data = d.data();
                const myUnread = data.unreadCounts?.[user.uid] || 0;

                // Find teacher ID (the other participant)
                const otherId = data.participants.find((p: string) => p !== user.uid);

                if (otherId) {
                    if (myUnread > 0) {
                        total += myUnread;
                        counts[otherId] = (counts[otherId] || 0) + myUnread;
                    }
                    if (data.lastMessage) {
                        msgs[otherId] = data.lastMessage;
                        if (data.lastMessageAt) {
                            times[otherId] = data.lastMessageAt;
                        }
                    }
                }
            });
            setUnreadTeachersCount(total);
            setTeacherUnreadCounts(counts);
            setTeacherLastMessages(msgs);
            setTeacherLastMessageTimes(times);
        });

        return () => unsub();
    }, [user, id]);

    // Fetch Notebooks & Pages
    useEffect(() => {
        if (!id) return;

        setLoading(true);
        // Notebooks
        const qNotebooks = query(collection(db, 'notebooks'), where('studentId', '==', id));
        const unsubNotebooks = onSnapshot(qNotebooks, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notebook));
            setNotebooks(list);
            setLoading(false);
        });

        // Pages
        const qPages = query(collection(db, 'pages'), where('studentId', '==', id));
        const unsubPages = onSnapshot(qPages, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Page));
            setPages(list);
            // Calculate retention
            if (list.length > 0) {
                const total = list.reduce((acc, p) => acc + calculateRetrievability(p), 0);
                setAvgRetention(total / list.length);
            } else {
                setAvgRetention(0);
            }
        });

        return () => {
            unsubNotebooks();
            unsubPages();
        };

    }, [id]);

    // Fetch Linked Teachers
    useEffect(() => {
        if (!id) return;

        // Find teachers who have this student in their linkedStudents array
        const qTeachers = query(
            collection(db, 'users'),
            where('role', '==', 'teacher'),
            where('linkedStudents', 'array-contains', id)
        );

        const unsub = onSnapshot(qTeachers, (snap) => {
            const list = snap.docs.map(d => ({ uid: d.id, ...d.data() } as TeacherProfile));
            setTeachers(list);
        });

        return () => unsub();
    }, [id]);



    const [activeTab, setActiveTab] = useState<'analytics' | 'notebooks' | 'teachers'>('analytics');

    const renderNotebook = ({ item }: { item: Notebook }) => {
        // Count pages
        const notebookPages = pages.filter(p => p.notebookId === item.id);

        const completed = notebookPages.filter(p => p.isCompleted).length;
        const inProgress = notebookPages.filter(p => !p.isCompleted && (p.plannedTimeMinutes || 0) > 0).length;
        const notPlanned = notebookPages.filter(p => !p.isCompleted && (!p.plannedTimeMinutes || p.plannedTimeMinutes === 0)).length;

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({
                    pathname: `/parent/notebook/${item.id}`,
                    params: { studentId: id, notebookTitle: item.title }
                })}
            >
                <View style={styles.iconBox}>
                    <MaterialCommunityIcons name="notebook" size={24} color="#35c128" />
                </View>
                <View style={styles.info}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                        <Text style={{ color: '#2196F3', fontSize: 13, fontWeight: '500' }}>To Plan: {notPlanned}</Text>
                        <Text style={{ color: '#666', fontSize: 13, marginHorizontal: 6 }}>•</Text>
                        <Text style={{ color: '#FFC107', fontSize: 13, fontWeight: '500' }}>In Progress: {inProgress}</Text>
                        <Text style={{ color: '#666', fontSize: 13, marginHorizontal: 6 }}>•</Text>
                        <Text style={{ color: '#35c128', fontSize: 13, fontWeight: '500' }}>Completed: {completed}</Text>
                    </View>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
        );
    };

    const handleMessageTeacher = async (teacher: TeacherProfile) => {
        if (!user || !user.uid) return;
        setChatRecipient(teacher);

        try {
            const conversation = await getOrCreateConversation(teacher.uid, user.uid, id as string, name as string);
            setActiveConversationId(conversation.id);
            setIsChatOpen(true);
        } catch (e) {
            console.error("Error starting chat:", e);
        }
    };

    const renderTeacher = ({ item }: { item: TeacherProfile }) => (
        <TeacherCard
            teacher={item}
            unreadCount={teacherUnreadCounts[item.uid] || 0}
            lastMessage={teacherLastMessages[item.uid]}
            onPress={() => handleMessageTeacher(item)}
            onProfile={() => setSelectedTeacher(item)}
        />
    );

    const sortedTeachers = useMemo(() => {
        return [...teachers].sort((a, b) => {
            // 1. Unread Count (High to Low)
            const unreadA = teacherUnreadCounts[a.uid] || 0;
            const unreadB = teacherUnreadCounts[b.uid] || 0;
            if (unreadA !== unreadB) return unreadB - unreadA;

            // 2. Last Message Time (Recent to Old)
            const timeA = teacherLastMessageTimes[a.uid] || 0;
            const timeB = teacherLastMessageTimes[b.uid] || 0;
            if (timeA !== timeB) return timeB - timeA;

            // 3. Alphabetical (A-Z)
            return a.displayName.localeCompare(b.displayName);
        });
    }, [teachers, teacherUnreadCounts, teacherLastMessageTimes]);

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {loading ? <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} /> : (
                <>
                    <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                        <TouchableOpacity style={[styles.backBtn, { top: insets.top + 35 }]} onPress={() => router.back()}>
                            <MaterialCommunityIcons name="arrow-left" size={28} color="#aaa" />
                        </TouchableOpacity>

                        <View style={{ alignItems: 'center', marginTop: 10 }}>
                            <Text style={styles.studentName}>{name || 'Student'}</Text>
                            <View style={styles.retentionBadge}>
                                <Text style={styles.retentionVal}>{formatRetrievability(avgRetention)} Retention</Text>
                            </View>
                        </View>

                        {/* Tabs */}
                        <View style={styles.tabContainer}>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'analytics' && styles.activeTab]}
                                onPress={() => setActiveTab('analytics')}
                            >
                                <Text style={[styles.tabText, activeTab === 'analytics' && styles.activeTabText]}>Analytics</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'notebooks' && styles.activeTab]}
                                onPress={() => setActiveTab('notebooks')}
                            >
                                <Text style={[styles.tabText, activeTab === 'notebooks' && styles.activeTabText]}>Notebooks</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'teachers' && styles.activeTab, { flexDirection: 'row', gap: 6, justifyContent: 'center' }]}
                                onPress={() => setActiveTab('teachers')}
                            >
                                <Text style={[styles.tabText, activeTab === 'teachers' && styles.activeTabText]}>Teachers</Text>
                                {unreadTeachersCount > 0 && (
                                    <View style={{ backgroundColor: '#FF3B30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 }}>
                                        <Text style={{ color: 'white', fontSize: 10, fontWeight: 'bold' }}>{unreadTeachersCount}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {activeTab === 'analytics' ? (
                        <AnalyticsDashboard pages={pages} notebooks={notebooks} />
                    ) : activeTab === 'notebooks' ? (
                        <FlatList
                            data={notebooks}
                            keyExtractor={item => item.id}
                            renderItem={renderNotebook}
                            contentContainerStyle={styles.list}
                            ListEmptyComponent={<Text style={styles.empty}>No visible notebooks found.</Text>}
                        />
                    ) : (
                        <FlatList
                            data={sortedTeachers}
                            keyExtractor={item => item.uid}
                            renderItem={renderTeacher}
                            contentContainerStyle={styles.list}
                            ListEmptyComponent={<Text style={styles.empty}>No linked teachers found.</Text>}
                        />
                    )}

                    <TeacherBioModal
                        visible={!!selectedTeacher}
                        teacher={selectedTeacher}
                        unreadCount={selectedTeacher ? (teacherUnreadCounts[selectedTeacher.uid] || 0) : 0}
                        onClose={() => setSelectedTeacher(null)}
                        onMessage={() => {
                            const t = selectedTeacher;
                            setSelectedTeacher(null);
                            if (t) handleMessageTeacher(t);
                        }}
                    />

                    <Modal visible={isChatOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setIsChatOpen(false)}>
                        {chatRecipient && (
                            <ChatInterface
                                conversationId={activeConversationId}
                                recipientName={chatRecipient.displayName}
                                recipientRole="teacher"
                                onClose={() => setIsChatOpen(false)}
                            />
                        )}
                    </Modal>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { backgroundColor: '#1e1e1e', paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: '#333' },
    backBtn: { position: 'absolute', left: 15, zIndex: 10, padding: 5 },
    studentName: { color: 'white', fontSize: 22, fontWeight: 'bold' },
    retentionBadge: { backgroundColor: 'rgba(53, 193, 40, 0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
    retentionVal: { color: '#35c128', fontWeight: 'bold', fontSize: 14 },

    tabContainer: { flexDirection: 'row', marginTop: 20 },
    tab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: '#35c128' },
    tabText: { color: '#888', fontWeight: '600', fontSize: 16 },
    activeTabText: { color: '#35c128' },

    content: { padding: 20 },
    list: { padding: 20 },
    card: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    iconBox: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: 'rgba(53, 193, 40, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    info: { flex: 1 },
    cardTitle: { color: 'white', fontSize: 16, fontWeight: '600' },
    cardSub: { color: '#aaa', fontSize: 13, marginTop: 2 },
    empty: { color: '#666', textAlign: 'center', marginTop: 50 },
    subHeader: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 15, marginTop: 30 },

    chartSection: { marginTop: 10 },
    filterRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
    toggleContainer: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 20, padding: 2 },
    toggleBtn: { paddingHorizontal: 20, paddingVertical: 6, borderRadius: 18 },
    toggleBtnActive: { backgroundColor: '#35c128' },
    toggleText: { color: '#aaa', fontWeight: 'bold', fontSize: 13 },
    toggleTextActive: { color: 'white' },

    dateRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 15 },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#333', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    dateText: { color: 'white', fontSize: 13 },
});

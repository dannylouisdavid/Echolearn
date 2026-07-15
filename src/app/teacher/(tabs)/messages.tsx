import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../../services/auth/AuthContext';
import { collection, query, where, getDocs, doc, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { Conversation, User, Group } from '../../../types/schema';
import { subscribeToConversations, sendBroadcastMessage, getOrCreateConversation } from '../../../services/messaging';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ChatInterface from '../../../components/ChatInterface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MessagesScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'parents' | 'groups'>('parents');
    const [loading, setLoading] = useState(true);
    const insets = useSafeAreaInsets();

    // Data State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [allParents, setAllParents] = useState<{ parent: User; studentName: string; groupName?: string; lastMessage?: string; unread?: number }[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);

    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');

    // Chat State
    const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
    const [chatRecipient, setChatRecipient] = useState<{ name: string; role: 'parent' | 'teacher'; subtitle?: string } | null>(null);

    // Initial Fetch
    useEffect(() => {
        if (!user) return;

        // 1. Subscribe to existing conversations
        const unsub = subscribeToConversations(user.uid, (convs) => {
            setConversations(convs);
        });

        const loadData = async () => {
            // 2. Fetch Groups First
            const groupsData = await fetchGroups();

            // 3. Fetch Linked Parents with Group Context
            if (groupsData) {
                await fetchLinkedParents(groupsData);
            }
        };

        loadData();

        return () => unsub();
    }, [user]);



    const fetchLinkedParents = async (currentGroups: Group[]) => {
        if (!user) return;
        setLoading(true);
        try {
            // 1. Get all students linked to this teacher
            const qStudents = query(
                collection(db, 'users'),
                where('role', '==', 'student'),
                where('linkedTeachers', 'array-contains', user.uid)
            );
            const studentSnap = await getDocs(qStudents);

            const parentsMap = new Map<string, { parent: User; studentName: string; groupName: string }>();

            for (const sDoc of studentSnap.docs) {
                const sData = sDoc.data();
                const studentName = sData.displayName;
                const linkedParents = sData.linkedParents || [];

                // Find Groups (robust check)
                const studentGroups = currentGroups.filter(g => g.studentIds && g.studentIds.includes(sDoc.id));
                const groupName = studentGroups.map(g => g.name).join(', ');

                for (const pid of linkedParents) {
                    if (!parentsMap.has(pid)) {
                        const pDoc = await getDoc(doc(db, 'users', pid));
                        if (pDoc.exists()) {
                            parentsMap.set(pid, {
                                parent: { uid: pid, ...pDoc.data() } as User,
                                studentName,
                                groupName
                            });
                        }
                    } else {
                        // Append student name if multiple children
                        const existing = parentsMap.get(pid)!;
                        if (!existing.studentName.includes(studentName)) {
                            existing.studentName += `, ${studentName}`;
                            if (groupName && !existing.groupName.includes(groupName)) {
                                existing.groupName = existing.groupName ? `${existing.groupName}, ${groupName}` : groupName;
                            }
                            parentsMap.set(pid, existing);
                        }
                    }
                }
            }

            setAllParents(Array.from(parentsMap.values()));
        } catch (e) {
            console.error("Error fetching parents:", e);
        } finally {
            setLoading(false);
        }
    };

    const fetchGroups = async () => {
        if (!user) return [];
        try {
            // Support both ownerId and teacherId for legacy data
            const q = query(collection(db, 'groups'), where('ownerId', '==', user.uid));
            const qLegacy = query(collection(db, 'groups'), where('teacherId', '==', user.uid));

            const [snap, snapLegacy] = await Promise.all([getDocs(q), getDocs(qLegacy)]);

            // Merge and dedup
            const gMap = new Map<string, Group>();
            snap.docs.forEach(d => gMap.set(d.id, { id: d.id, ...d.data() } as Group));
            snapLegacy.docs.forEach(d => gMap.set(d.id, { id: d.id, ...d.data() } as Group));

            const gList = Array.from(gMap.values());
            setGroups(gList);
            return gList;
        } catch (e) {
            console.error(e);
            return [];
        }
    };

    // Derived List for Display
    const getDisplayList = () => {
        if (activeTab === 'parents') {
            // Merge All Parents with Conversations
            const list = allParents.map(item => {
                const conv = conversations.find(c => c.participants.includes(item.parent.uid));
                return {
                    ...item,
                    lastMessage: conv?.lastMessage || '',
                    lastMessageAt: conv?.lastMessageAt || 0,
                    unread: conv?.unreadCounts[user!.uid] || 0,
                    conversationId: conv?.id
                };
            });

            // Filter
            const filtered = list.filter(item =>
                item.parent.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.studentName.toLowerCase().includes(searchQuery.toLowerCase())
            );

            // Sort: Unread > Last Messaged > Alphabetical
            return filtered.sort((a, b) => {
                if (a.unread !== b.unread) return b.unread - a.unread;
                if (a.lastMessageAt !== b.lastMessageAt) return b.lastMessageAt - a.lastMessageAt;
                return a.parent.displayName.localeCompare(b.parent.displayName);
            });
        }
        return [];
    };

    const handleParentPress = async (item: any) => {
        setChatRecipient({
            name: item.parent.displayName,
            role: 'parent',
            subtitle: `${item.studentName} | ${item.groupName || 'No Group'}`
        });
        if (item.conversationId) {
            setSelectedConversation(item.conversationId);
        } else {
            // Create new
            try {
                const newConv = await getOrCreateConversation(user!.uid, item.parent.uid, undefined, item.studentName);
                setSelectedConversation(newConv.id);
            } catch (e) {
                console.error(e);
            }
        }
    };

    // Broadcast
    const [broadcastModal, setBroadcastModal] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [broadcastText, setBroadcastText] = useState('');
    const [sendingBroadcast, setSendingBroadcast] = useState(false);

    const handleSendBroadcast = async () => {
        if (!selectedGroupId || !broadcastText.trim() || !user) return;
        setSendingBroadcast(true);
        try {
            await sendBroadcastMessage(user.uid, selectedGroupId, broadcastText.trim());
            setBroadcastModal(false);
            setBroadcastText('');
            setSelectedGroupId(null);
            alert("Broadcast sent successfully!");
        } catch (e) {
            alert("Error sending broadcast.");
            console.error(e);
        } finally {
            setSendingBroadcast(false);
        }
    };

    const renderParentItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.itemCard} onPress={() => handleParentPress(item)}>
            <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.parent.displayName.charAt(0).toUpperCase()}</Text>
                {item.unread > 0 && (
                    <View style={styles.badgeOverlay}>
                        <Text style={styles.badgeText}>{item.unread}</Text>
                    </View>
                )}
            </View>
            <View style={styles.itemInfo}>
                <View style={styles.row}>
                    <Text style={[styles.itemName, { flexShrink: 1 }]} numberOfLines={1}>
                        {item.parent.displayName}
                    </Text>
                    <Text style={{ color: '#888', fontSize: 13, flex: 1, textAlign: 'right', marginLeft: 8 }} numberOfLines={1}>
                        ({item.studentName}{!!item.groupName && ` | ${item.groupName}`})
                    </Text>
                </View>
                <View style={[styles.row, { marginTop: 4 }]}>
                    <Text style={styles.lastMsg} numberOfLines={1}>{item.lastMessage || 'No messages yet'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>

                        {item.lastMessageAt > 0 && <Text style={styles.time}>{new Date(item.lastMessageAt).toLocaleDateString()}</Text>}
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );

    const renderGroupItem = ({ item }: { item: Group }) => (
        <TouchableOpacity style={styles.itemCard} onPress={() => {
            setSelectedGroupId(item.id);
            setBroadcastModal(true);
        }}>
            <View style={[styles.avatar, { backgroundColor: '#FF9800' }]}>
                <MaterialCommunityIcons name="account-group" size={24} color="#fff" />
            </View>
            <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.studentName}>{item.studentIds?.length || 0} Students</Text>
                <Text style={styles.lastMsg}>Tap to broadcast message</Text>
            </View>
            <MaterialCommunityIcons name="bullhorn-outline" size={24} color="#FF9800" />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                <Text style={styles.title}>Messages</Text>

                {/* Search */}
                {activeTab === 'parents' && (
                    <View style={styles.searchBox}>
                        <MaterialCommunityIcons name="magnify" size={20} color="#888" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search parent / guardian or student..."
                            placeholderTextColor="#666"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                )}

                {/* Tabs */}
                <View style={styles.tabs}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'parents' && styles.activeTab]}
                        onPress={() => setActiveTab('parents')}
                    >
                        <Text style={[styles.tabText, activeTab === 'parents' && styles.activeTabText]}>
                            Parents / Guardians {activeTab === 'parents' && (() => {
                                const list = getDisplayList();
                                const totalUnread = list.reduce((acc, i) => acc + (i.unread || 0), 0);
                                return totalUnread > 0 ? `(${totalUnread})` : '';
                            })()}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'groups' && styles.activeTab]}
                        onPress={() => setActiveTab('groups')}
                    >
                        <Text style={[styles.tabText, activeTab === 'groups' && styles.activeTabText]}>Groups</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={(activeTab === 'parents' ? getDisplayList() : groups) as any[]}
                    keyExtractor={(item: any) => activeTab === 'parents' ? item.parent.uid : item.id}
                    renderItem={activeTab === 'parents' ? renderParentItem : renderGroupItem}
                    contentContainerStyle={[styles.list, { flexGrow: 1 }]}
                    ListEmptyComponent={
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 120 }}>
                            <Text style={[styles.empty, { marginTop: 0, marginBottom: 10 }]}>No {activeTab === 'parents' ? 'Parents / Guardians' : activeTab} found.</Text>
                            {activeTab === 'parents' && (
                                <Text style={{ color: '#666', textAlign: 'center', fontSize: 14 }}>
                                    Link with students to add them to this list.
                                </Text>
                            )}
                        </View>
                    }
                />
            )}

            {/* Chat Modal */}
            <Modal visible={!!selectedConversation} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSelectedConversation(null)}>
                {selectedConversation && chatRecipient && (
                    <ChatInterface
                        conversationId={selectedConversation}
                        recipientName={chatRecipient.name}
                        recipientRole={chatRecipient.role}
                        subtitle={chatRecipient.subtitle}
                        onClose={() => setSelectedConversation(null)}
                    />
                )}
            </Modal>

            {/* Broadcast Modal */}
            <Modal visible={broadcastModal} transparent animationType="fade" onRequestClose={() => setBroadcastModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Broadcast to Group</Text>
                        <Text style={styles.modalSub}>This message will be sent individually to all parents in this group.</Text>

                        <TextInput
                            style={styles.broadcastInput}
                            placeholder="Type your message..."
                            placeholderTextColor="#666"
                            value={broadcastText}
                            onChangeText={setBroadcastText}
                            multiline
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setBroadcastModal(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.sendBtn, (!broadcastText.trim() || sendingBroadcast) && styles.disabledBtn]}
                                onPress={handleSendBroadcast}
                                disabled={!broadcastText.trim() || sendingBroadcast}
                            >
                                {sendingBroadcast ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send Broadcast</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { paddingHorizontal: 20, paddingBottom: 0 }, // Tabs determine bottom padding
    title: { color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 15 },

    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2b2b2b', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 15 },
    searchInput: { flex: 1, color: '#fff', marginLeft: 10 },

    tabs: { flexDirection: 'row' },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: '#35c128' },
    tabText: { color: '#888', fontWeight: '600' },
    activeTabText: { color: '#35c128' },

    list: { padding: 20 },
    itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10 },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(53, 193, 40, 0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    avatarText: { color: '#35c128', fontSize: 20, fontWeight: 'bold' },
    itemInfo: { flex: 1 },
    itemName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    studentName: { color: '#888', fontSize: 13, marginTop: 2 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    lastMsg: { color: '#aaa', fontSize: 13, marginTop: 4, flex: 1, marginRight: 10 },
    time: { color: '#666', fontSize: 12 },


    badgeOverlay: {
        position: 'absolute',
        top: -4,
        left: -4,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#1e1e1e',
        paddingHorizontal: 4
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

    empty: { color: '#666', textAlign: 'center', marginTop: 50 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#1e1e1e', borderRadius: 12, padding: 20 },
    modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
    modalSub: { color: '#aaa', marginBottom: 20 },
    broadcastInput: { backgroundColor: '#2b2b2b', borderRadius: 8, padding: 15, color: '#fff', height: 120, textAlignVertical: 'top', marginBottom: 20 },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15 },
    cancelBtn: { padding: 10 },
    cancelText: { color: '#aaa' },
    sendBtn: { backgroundColor: '#35c128', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    disabledBtn: { backgroundColor: '#2a5a2a' },
    sendText: { color: '#fff', fontWeight: 'bold' }
});

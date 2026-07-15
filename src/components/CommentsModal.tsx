import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, deleteDoc, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { useAuth } from '../services/auth/AuthContext';
import { Comment, UserRole } from '../types/schema';

interface CommentsModalProps {
    visible: boolean;
    onClose: () => void;
    threadId: string; // Page ID
    allowedChannels: ('teacher_student' | 'parent_student')[];
    userRole: UserRole; // Current user's role
}

export default function CommentsModal({ visible, onClose, threadId, allowedChannels, userRole }: CommentsModalProps) {
    const { user } = useAuth();
    const [activeChannel, setActiveChannel] = useState<'teacher_student' | 'parent_student'>(allowedChannels[0] || 'teacher_student');
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [sending, setSending] = useState(false);
    const flatListRef = useRef<FlatList>(null);

    // Ensure active channel is valid
    useEffect(() => {
        if (!allowedChannels.includes(activeChannel)) {
            setActiveChannel(allowedChannels[0] || 'teacher_student');
        }
    }, [allowedChannels]);

    useEffect(() => {
        if (!visible || !threadId || !user) return;
        setLoading(true);

        const q = query(
            collection(db, 'comments'),
            where('threadId', '==', threadId),
            // We filter by visibility so parents don't see teacher comments and vice versa, unless intended.
            where('visibility', '==', activeChannel),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedComments: Comment[] = [];
            snapshot.forEach(doc => {
                loadedComments.push({ id: doc.id, ...doc.data() } as Comment);
            });
            setComments(loadedComments);
            setLoading(false);

            // Auto-mark as read logic
            loadedComments.forEach(c => {
                if (c.authorId !== user.uid && (!c.readBy || !c.readBy.includes(user.uid))) {
                    console.log(`Marking comment ${c.id} as read by ${user.uid}`);
                    updateDoc(doc(db, 'comments', c.id), {
                        readBy: [...(c.readBy || []), user.uid]
                    }).catch(e => console.log("Mark read failed", e));
                }
            });

        }, (err) => {
            console.error("Comments listener error:", err);
            setLoading(false);
        });

        return unsubscribe;
    }, [visible, threadId, activeChannel]);

    const handleSend = async () => {
        if (!newComment.trim() || !user) return;
        setSending(true);
        try {
            // 1. Add Comment
            await addDoc(collection(db, 'comments'), {
                threadId,
                content: newComment.trim(),
                authorId: user.uid,
                authorRole: userRole,
                authorName: user.displayName || 'User',
                createdAt: Date.now(),
                readBy: [user.uid],
                visibility: activeChannel
            });

            // 2. Send Notification
            // We need to know who to notify.
            const pageDoc = await getDoc(doc(db, 'pages', threadId));
            if (pageDoc.exists()) {
                const pageData = pageDoc.data();
                const studentId = pageData.ownerId;
                const notebookId = pageData.notebookId;

                const recipients = new Set<string>();

                if (activeChannel === 'teacher_student') {
                    if (user.uid === studentId) {
                        // Student -> Teacher(s)
                        // Look up teacher via notebook -> group -> teacherId
                        // Look up teacher via managedBy or sourceNotebook
                        if (notebookId) {
                            const nbDoc = await getDoc(doc(db, 'notebooks', notebookId));
                            if (nbDoc.exists()) {
                                const nbData = nbDoc.data();

                                // 1. Check if directly managed by a teacher
                                if (nbData.managedBy) {
                                    recipients.add(nbData.managedBy);
                                }
                                // 2. If no direct manager, check source notebook (Master)
                                else if (nbData.sourceNotebookId) {
                                    try {
                                        const sourceDoc = await getDoc(doc(db, 'notebooks', nbData.sourceNotebookId));
                                        if (sourceDoc.exists()) {
                                            const sourceData = sourceDoc.data();
                                            // The owner of the Master Notebook is the Teacher
                                            if (sourceData.ownerId) {
                                                recipients.add(sourceData.ownerId);
                                            } else if (sourceData.managedBy) {
                                                recipients.add(sourceData.managedBy);
                                            }
                                        }
                                    } catch (err) {
                                        console.log("Teacher lookup failed (permission?)", err);
                                        // Fallback to groupId if source read fails
                                        if (nbData.groupId) {
                                            const groupDoc = await getDoc(doc(db, 'groups', nbData.groupId));
                                            if (groupDoc.exists() && groupDoc.data().teacherId) {
                                                recipients.add(groupDoc.data().teacherId);
                                            }
                                        }
                                    }
                                }
                                // 3. Fallback: Check for legacy groupId
                                else if (nbData.groupId) {
                                    const groupDoc = await getDoc(doc(db, 'groups', nbData.groupId));
                                    if (groupDoc.exists() && groupDoc.data().teacherId) {
                                        recipients.add(groupDoc.data().teacherId);
                                    }
                                }
                            }
                        }
                    } else {
                        // Teacher -> Student
                        recipients.add(studentId);
                    }
                } else if (activeChannel === 'parent_student') {
                    if (user.uid === studentId) {
                        // Student -> Parent(s)
                        const userDoc = await getDoc(doc(db, 'users', studentId));
                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            const parents = data.linkedParents || data.parentIds || []; // Support both
                            parents.forEach((pid: string) => recipients.add(pid));
                        }
                    } else {
                        // Parent -> Student
                        recipients.add(studentId);
                    }
                }

                // Create Notification Docs
                recipients.forEach(async (recipientId) => {
                    if (recipientId !== user.uid) { // Don't notify self
                        await addDoc(collection(db, 'notifications'), {
                            userId: recipientId,
                            title: `New Comment from ${user.displayName || 'User'}`,
                            message: newComment.trim().substring(0, 50) + (newComment.length > 50 ? '...' : ''), // Backwards compatibility
                            body: newComment.trim().substring(0, 50) + (newComment.length > 50 ? '...' : ''),
                            type: 'comment_added', // FIXED: Add top-level type
                            data: { type: 'comment', threadId, role: userRole },
                            createdAt: Date.now(),
                            read: false
                        });
                    }
                });
            }

            setNewComment('');
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to send comment.");
        } finally {
            setSending(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        Alert.alert("Delete", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        await deleteDoc(doc(db, 'comments', commentId));
                    } catch (e) { console.error(e); }
                }
            }
        ]);
    };

    const renderItem = ({ item }: { item: Comment }) => {
        const isMe = item.authorId === user?.uid;
        return (
            <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    <Text style={styles.author}>{item.authorName} ({item.authorRole})</Text>
                    <Text style={styles.content}>{item.content}</Text>
                    <View style={styles.footer}>
                        <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                        {isMe && (
                            <Pressable onPress={() => handleDelete(item.id)}>
                                <MaterialCommunityIcons name="trash-can-outline" size={14} color="rgba(255,255,255,0.7)" style={{ marginLeft: 8 }} />
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>
        );
    };

    if (!visible) return null;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={[styles.overlay, StyleSheet.absoluteFill, { zIndex: 1000 }]}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={[styles.header, { backgroundColor: activeChannel === 'teacher_student' ? '#2196F3' : '#35c128' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialCommunityIcons name="comment-text-multiple" size={24} color="white" style={{ marginRight: 10 }} />
                        <Text style={styles.headerTitle}>Discussion</Text>
                    </View>
                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <MaterialCommunityIcons name="close" size={24} color="white" />
                    </Pressable>
                </View>

                {/* Tabs (Only if multiple channels allowed) */}
                {allowedChannels.length > 1 && (
                    <View style={styles.tabContainer}>
                        <Pressable
                            style={[styles.tab, activeChannel === 'teacher_student' && styles.activeTab]}
                            onPress={() => setActiveChannel('teacher_student')}
                        >
                            <Text style={[styles.tabText, activeChannel === 'teacher_student' && styles.activeTabText]}>Teacher</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.tab, activeChannel === 'parent_student' && styles.activeTab]}
                            onPress={() => setActiveChannel('parent_student')}
                        >
                            <Text style={[styles.tabText, activeChannel === 'parent_student' && styles.activeTabText]}>Parent</Text>
                        </Pressable>
                    </View>
                )}

                {/* Chat Area */}
                {loading ? <ActivityIndicator size="large" color="#666" style={{ marginTop: 20 }} /> : (
                    <FlatList
                        ref={flatListRef}
                        data={comments}
                        keyExtractor={i => i.id}
                        renderItem={renderItem}
                        contentContainerStyle={styles.list}
                        inverted={false}
                        ListEmptyComponent={<Text style={styles.empty}>No comments yet. Start a discussion!</Text>}
                    />
                )}

                {/* Input Area */}
                <View style={styles.inputArea}>
                    <TextInput
                        style={styles.input}
                        placeholder={`Message ${activeChannel === 'teacher_student' ? 'Teacher' : 'Parent'}...`}
                        placeholderTextColor="#888"
                        multiline
                        value={newComment}
                        onChangeText={setNewComment}
                    />
                    <Pressable
                        style={[styles.sendBtn, !newComment.trim() && { opacity: 0.5 }, { backgroundColor: activeChannel === 'teacher_student' ? '#2196F3' : '#35c128' }]}
                        onPress={handleSend}
                        disabled={!newComment.trim() || sending}
                    >
                        {sending ? <ActivityIndicator size="small" color="white" /> : <MaterialCommunityIcons name="send" size={20} color="white" />}
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    overlay: { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { backgroundColor: '#1e1e1e', height: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15 },
    headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    closeBtn: { padding: 5 },

    tabContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333' },
    tab: { flex: 1, padding: 12, alignItems: 'center' },
    activeTab: { borderBottomWidth: 3, borderBottomColor: '#fff', backgroundColor: 'rgba(255,255,255,0.05)' },
    tabText: { color: '#888', fontWeight: 'bold' },
    activeTabText: { color: 'white' },

    list: { padding: 15, paddingBottom: 20 },
    empty: { color: '#666', textAlign: 'center', marginTop: 50 },

    msgRow: { flexDirection: 'row', marginBottom: 12 },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowOther: { justifyContent: 'flex-start' },

    bubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
    bubbleMe: { backgroundColor: '#333', borderBottomRightRadius: 2, borderWidth: 1, borderColor: '#444' }, // Me is always dark
    bubbleOther: { backgroundColor: '#252525', borderBottomLeftRadius: 2 },

    author: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginBottom: 4, fontWeight: 'bold' },
    content: { color: 'white', fontSize: 15 },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
    time: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },

    inputArea: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: '#333', backgroundColor: '#1a1a1a' },
    input: { flex: 1, backgroundColor: '#252525', color: 'white', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, maxHeight: 100, marginRight: 10 },
    sendBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' }
});

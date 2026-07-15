import {
    collection,
    addDoc,
    updateDoc,
    doc,
    serverTimestamp,
    query,
    where,
    getDocs,
    limit,
    getDoc,
    increment,
    orderBy,
    onSnapshot
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { Conversation, Message, UserRole } from '../types/schema';

// Get or Create Conversation
export const getOrCreateConversation = async (teacherId: string, parentId: string, studentId?: string, studentName?: string) => {
    // Check if conversation exists
    const q = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', teacherId)
    );

    const snapshot = await getDocs(q);
    const existing = snapshot.docs.find(d => {
        const data = d.data() as Conversation;
        return data.participants.includes(parentId);
        // Could also check relatedStudentId if we want separate threads per student (Optional)
    });

    if (existing) {
        return { id: existing.id, ...existing.data() } as Conversation;
    }

    // Create New
    const newConv: Omit<Conversation, 'id'> = {
        participants: [teacherId, parentId],
        participantRoles: {
            [teacherId]: 'teacher',
            [parentId]: 'parent'
        },
        teacherId,
        parentId,
        lastMessage: '',
        lastMessageAt: Date.now(),
        unreadCounts: {
            [teacherId]: 0,
            [parentId]: 0
        },
        relatedStudentId: studentId,
        relatedStudentName: studentName
    };

    const ref = await addDoc(collection(db, 'conversations'), newConv);
    return { id: ref.id, ...newConv } as Conversation;
};

// Send Message (1:1)
export const sendMessage = async (conversationId: string, senderId: string, text: string, type: 'text' | 'broadcast' = 'text', broadcastGroupId?: string) => {
    // 1. Add Message
    const msgData: any = {
        conversationId,
        senderId,
        text,
        createdAt: Date.now(),
        readBy: [senderId],
        type
    };

    if (broadcastGroupId) {
        msgData.broadcastGroupId = broadcastGroupId;
    }

    await addDoc(collection(db, 'messages'), msgData);

    // 2. Update Conversation (Last Message & Unread Count)
    const convRef = doc(db, 'conversations', conversationId);

    // We need to know who the OTHER participant is to increment their unread count
    // Fetch conv to find participants
    const convSnap = await getDoc(convRef);
    if (!convSnap.exists()) return;
    const convData = convSnap.data() as Conversation;

    const otherParticipant = convData.participants.find(p => p !== senderId);

    const updates: any = {
        lastMessage: text,
        lastMessageAt: Date.now()
    };

    if (otherParticipant) {
        updates[`unreadCounts.${otherParticipant}`] = increment(1);
    }

    await updateDoc(convRef, updates);
};

// Broadcast to Group
export const sendBroadcastMessage = async (teacherId: string, groupId: string, text: string) => {
    // 1. Get Group to find students
    const groupRef = doc(db, 'groups', groupId);
    const groupSnap = await getDoc(groupRef);
    if (!groupSnap.exists()) throw new Error("Group not found");

    const studentIds = groupSnap.data().studentIds || [];
    if (studentIds.length === 0) return;

    // 2. Find Parents for each student
    // Efficient approach: Query students to get linkedParents
    // NOTE: In a real app with thousands of students, we'd chunk this.
    // For MVP, we iterate.

    const parentIds = new Set<string>();

    // Batch fetching student profiles would be better, but lets loop for simplicity in MVP
    for (const sid of studentIds) {
        const sDoc = await getDoc(doc(db, 'users', sid));
        if (sDoc.exists()) {
            const sData = sDoc.data();
            const linkedParents = sData.linkedParents || [];
            linkedParents.forEach((pid: string) => parentIds.add(pid));
        }
    }

    // 3. Send Message to each Parent
    for (const pid of Array.from(parentIds)) {
        // Find or Create conv
        const conv = await getOrCreateConversation(teacherId, pid);
        await sendMessage(conv.id, teacherId, text, 'broadcast', groupId);
    }
};

// Listen for Conversations (Inbox)
export const subscribeToConversations = (userId: string, callback: (conversations: Conversation[]) => void) => {
    const q = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', userId),
        orderBy('lastMessageAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
        const convs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Conversation));
        callback(convs);
    });
};

// Listen for Messages (Chat Room)
export const subscribeToMessages = (conversationId: string, callback: (messages: Message[]) => void) => {
    const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId),
        orderBy('createdAt', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
        callback(msgs);
    });
};

// Mark as Read
export const markConversationAsRead = async (conversationId: string, userId: string) => {
    const ref = doc(db, 'conversations', conversationId);
    await updateDoc(ref, {
        [`unreadCounts.${userId}`]: 0
    });
}

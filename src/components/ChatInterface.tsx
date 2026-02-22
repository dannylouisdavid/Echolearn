import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Message, UserRole } from '../types/schema';
import { subscribeToMessages, sendMessage, markConversationAsRead } from '../services/messaging';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../services/auth/AuthContext';

interface ChatInterfaceProps {
    conversationId: string;
    onClose: () => void;
    recipientName: string;
    recipientRole: 'teacher' | 'parent';
    subtitle?: string;
}

export default function ChatInterface({ conversationId, onClose, recipientName, recipientRole, subtitle }: ChatInterfaceProps) {
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const [messages, setMessages] = useState<Message[]>([]);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(true);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        const unsubscribe = subscribeToMessages(conversationId, (msgs) => {
            setMessages(msgs);
            setLoading(false);
            // Mark as read whenever new messages arrive and we are viewing
            if (user) {
                markConversationAsRead(conversationId, user.uid);
            }
        });
        return () => unsubscribe();
    }, [conversationId, user]);

    const handleSend = async () => {
        if (!text.trim() || !user) return;
        const msgText = text.trim();
        setText('');
        try {
            await sendMessage(conversationId, user.uid, msgText);
        } catch (error) {
            console.error("Error sending message:", error);
            // Optionally restore text on error
        }
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isMe = item.senderId === user?.uid;
        const isBroadcast = item.type === 'broadcast';

        return (
            <View style={[styles.msgContainer, isMe ? styles.myMsgContainer : styles.theirMsgContainer]}>
                {isBroadcast && !isMe && (
                    <Text style={styles.broadcastLabel}>📢 Broadcast</Text>
                )}
                <View style={[styles.bubble, isMe ? styles.myBubble : styles.theirBubble]}>
                    <Text style={isMe ? styles.myText : styles.theirText}>{item.text}</Text>
                </View>
                <Text style={styles.time}>
                    {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: '#121212' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={onClose} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#fff" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerName}>{recipientName}</Text>
                    <Text style={styles.headerRole}>{subtitle || (recipientRole === 'parent' ? 'Parent' : 'Teacher')}</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#35c128" />
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.listContent}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
                    onLayout={() => flatListRef.current?.scrollToEnd()}
                />
            )}

            <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 10 }]}>
                <TextInput
                    style={styles.input}
                    placeholder="Type a message..."
                    placeholderTextColor="#666"
                    value={text}
                    onChangeText={setText}
                    multiline
                />
                <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={!text.trim()}>
                    <MaterialCommunityIcons
                        name="send"
                        size={24}
                        color={text.trim() ? "#35c128" : "#444"}
                    />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingBottom: 15,
        backgroundColor: '#1e1e1e',
        borderBottomWidth: 1,
        borderBottomColor: '#333'
    },
    backBtn: { marginRight: 15 },
    headerName: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    headerRole: { color: '#888', fontSize: 13 },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    listContent: { padding: 15 },
    msgContainer: { marginBottom: 15, maxWidth: '80%' },
    myMsgContainer: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    theirMsgContainer: { alignSelf: 'flex-start', alignItems: 'flex-start' },

    bubble: { padding: 12, borderRadius: 16 },
    myBubble: { backgroundColor: 'rgba(53, 193, 40, 0.25)', borderBottomRightRadius: 4, borderWidth: 1, borderColor: 'rgba(53, 193, 40, 0.5)' },
    theirBubble: { backgroundColor: '#252525', borderBottomLeftRadius: 4 },

    myText: { color: '#fff', fontSize: 16 },
    theirText: { color: '#ddd', fontSize: 16 },

    time: { color: '#666', fontSize: 11, marginTop: 4, marginHorizontal: 4 },
    broadcastLabel: { color: '#FFC107', fontSize: 11, fontWeight: 'bold', marginBottom: 2 },

    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#1e1e1e',
        borderTopWidth: 1,
        borderTopColor: '#333'
    },
    input: {
        flex: 1,
        backgroundColor: '#2b2b2b',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        color: '#fff',
        maxHeight: 100,
        marginRight: 10
    },
    sendBtn: {
        padding: 10
    }
});

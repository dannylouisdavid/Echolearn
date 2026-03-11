import { Modal, View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Notification, UserRole } from '../types/schema';
import { useRouter } from 'expo-router';

interface NotificationsModalProps {
    visible: boolean;
    onClose: () => void;
    notifications: Notification[];
    onDelete: (id: string) => void;
    onMarkAsRead?: (id: string) => void;
    userRole?: UserRole;
}

export default function NotificationsModal({ visible, onClose, notifications, onDelete, onMarkAsRead, userRole }: NotificationsModalProps) {
    const router = useRouter();

    // Handle notification click - navigate to related content and mark as read
    const handleNotificationPress = (item: Notification) => {
        // Mark as read when tapped
        if (!item.read && onMarkAsRead) {
            onMarkAsRead(item.id);
        }

        // Handle specific nav for comments using data.threadId if relatedId is missing
        const targetId = item.relatedId || (item.data as any)?.threadId;
        if (!targetId && item.type !== 'notebook_assigned' && item.type !== 'new_invite') return;

        onClose(); // Close the modal first

        // Navigate based on notification type
        switch (item.type) {
            case 'topic_assigned':
            case 'notebook_assigned':
                // Navigate to the notebook
                router.push({
                    pathname: '/student/notebook/[id]',
                    params: { id: targetId }
                });
                break;
            case 'comment_added':
                router.push({
                    pathname: '/student/page/[id]',
                    params: { id: targetId, openComments: 'true' }
                });
                break;
            case 'group_added':
                // No specific navigation for group added
                break;
            case 'new_invite':
                // Navigate to the linking page based on user role
                // Student dashboard already shows pending invites, no navigation needed
                if (userRole === 'teacher') {
                    router.push('/teacher/link-students');
                } else if (userRole === 'parent') {
                    router.push('/parent/(tabs)/link-student');
                }
                break;
            default:
                // Other notifications don't navigate
                break;
        }
    };

    const renderItem = ({ item }: { item: Notification }) => {
        const targetId = item.relatedId || (item.data as any)?.threadId;
        const isClickable = item.type === 'new_invite' || (targetId && (item.type === 'topic_assigned' || item.type === 'notebook_assigned' || item.type === 'comment_added'));
        const isUnread = !item.read;

        return (
            <TouchableOpacity
                style={[styles.card, isUnread && styles.cardUnread]}
                onPress={() => handleNotificationPress(item)}
                disabled={!isClickable}
            >
                <View style={[styles.iconContainer, isUnread && styles.iconContainerUnread]}>
                    <MaterialCommunityIcons
                        name={
                            item.type === 'invite_rejected' ? 'alert-circle' :
                                item.type === 'new_invite' ? 'email-open' :
                                    item.type === 'topic_assigned' || item.type === 'notebook_assigned' ? 'book-open-variant' :
                                        item.type === 'comment_added' ? 'comment-text-multiple' :
                                            item.type === 'group_added' ? 'account-group' :
                                                'bell'
                        }
                        size={24}
                        color={
                            item.type === 'invite_rejected' ? '#F44336' :
                                item.type === 'new_invite' ? '#2196F3' :
                                    item.type === 'topic_assigned' || item.type === 'notebook_assigned' ? '#2196F3' :
                                        item.type === 'comment_added' ? '#E91E63' :
                                            item.type === 'group_added' ? '#FF9800' :
                                                '#35c128'
                        }
                    />
                </View>
                <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={[styles.title, !isUnread && styles.titleRead]}>{item.title}</Text>
                    <Text style={[styles.message, !isUnread && styles.messageRead]}>{item.message}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text style={[styles.date, isUnread && styles.dateUnread]}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                        {isClickable && isUnread && (
                            <Text style={styles.tapHint}>Tap to open</Text>
                        )}
                    </View>
                </View>
                <TouchableOpacity onPress={() => onDelete(item.id)} style={styles.checkBtn}>
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color="white" />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        <TouchableOpacity onPress={onClose}>
                            <MaterialCommunityIcons name="close" size={24} color="white" />
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={notifications}
                        renderItem={renderItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={{ padding: 20 }}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>No notifications</Text>
                        }
                    />
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    container: { backgroundColor: '#1e1e1e', height: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },

    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#252525', padding: 15, borderRadius: 12, marginBottom: 10 },
    cardUnread: { backgroundColor: '#2a2a2a', borderLeftWidth: 3, borderLeftColor: '#35c128' },
    iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
    iconContainerUnread: { backgroundColor: 'rgba(53, 193, 40, 0.15)' },

    title: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    titleRead: { color: '#888' },
    message: { color: '#ccc', fontSize: 14, marginTop: 2 },
    messageRead: { color: '#666' },
    date: { color: '#999', fontSize: 12 },
    dateUnread: { color: '#ffffff' },
    tapHint: { color: '#2196F3', fontSize: 11, marginLeft: 10, fontStyle: 'italic' },

    checkBtn: { backgroundColor: '#F44336', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
    emptyText: { color: '#666', textAlign: 'center', marginTop: 50, fontSize: 16 }
});

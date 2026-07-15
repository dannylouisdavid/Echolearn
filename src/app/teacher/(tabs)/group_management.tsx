import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../services/auth/AuthContext';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useFocusEffect } from '@react-navigation/native';

export default function GroupManagementScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(false);

    // Groups State
    const [groups, setGroups] = useState<any[]>([]);
    const [isGroupModalVisible, setGroupModalVisible] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");

    // Refetch groups whenever screen gains focus (ensures fresh data after navigation)
    useFocusEffect(
        useCallback(() => {
            if (user) {
                fetchGroups();
            }
        }, [user])
    );

    const fetchGroups = async () => {
        try {
            const q = query(collection(db, 'groups'), where('ownerId', '==', user?.uid));
            const snap = await getDocs(q);
            setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || !user) return;
        setLoading(true);
        try {
            await addDoc(collection(db, 'groups'), {
                name: newGroupName,
                ownerId: user.uid, // Ensuring consistency with schema
                teacherId: user.uid, // Keeping for backward compatibility if needed, or remove if strictly ownerId
                studentIds: [],
                createdAt: Date.now()
            });
            setGroupModalVisible(false);
            setNewGroupName("");
            fetchGroups();
        } catch (e) { Alert.alert("Error", "Failed to create group"); }
        finally { setLoading(false); }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                <Text style={styles.headerTitle}>My Groups</Text>
            </View>

            {/* Groups List */}
            <FlatList
                data={groups}
                keyExtractor={i => i.id}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.card} onPress={() => router.push({ pathname: '/teacher/group/[id]', params: { id: item.id } })}>
                        <MaterialCommunityIcons name="account-group" size={30} color="#FF9800" />
                        <View style={styles.info}>
                            <Text style={styles.cardTitle}>{item.name}</Text>
                            <Text style={styles.cardSub}>
                                {item.studentIds?.length || 0} Students
                            </Text>
                        </View>
                        <MaterialCommunityIcons name="chevron-right" size={24} color="#ccc" />
                    </TouchableOpacity>
                )}
                contentContainerStyle={[styles.list, groups.length === 0 && { flex: 1, justifyContent: 'center', paddingBottom: 100 }]}
                ListEmptyComponent={<Text style={styles.empty}>No groups yet. Create one to get started!</Text>}
            />

            {/* FAB */}
            <TouchableOpacity style={styles.fab} onPress={() => setGroupModalVisible(true)}>
                <MaterialCommunityIcons name="plus" size={24} color="white" />
                <Text style={styles.fabText}>New Group</Text>
            </TouchableOpacity>

            {/* Create Group Modal */}
            <Modal visible={isGroupModalVisible} transparent animationType="fade" onRequestClose={() => setGroupModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Create Student Group</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Group Name (e.g. Physics 101)"
                            placeholderTextColor="#666"
                            value={newGroupName}
                            onChangeText={setNewGroupName}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setGroupModalVisible(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={handleCreateGroup} disabled={loading}>
                                {loading ? <ActivityIndicator color="#35c128" /> : <Text style={styles.createText}>Create</Text>}
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
    header: { paddingHorizontal: 20, paddingBottom: 10 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },

    list: { padding: 15 },
    card: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    info: { flex: 1, marginLeft: 15 },
    cardTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
    cardSub: { fontSize: 13, color: '#aaa' },
    empty: { textAlign: 'center', color: '#666' },

    fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#2E7D32', borderRadius: 30, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', elevation: 4 },
    fabText: { color: 'white', fontWeight: 'bold', marginLeft: 8 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 25, borderRadius: 16 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: 'white' },
    input: { borderWidth: 1, borderColor: '#333', padding: 10, borderRadius: 8, marginBottom: 20, fontSize: 16, color: 'white', backgroundColor: '#252525' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
    cancelText: { color: '#aaa', fontSize: 16 },
    createText: { color: '#35c128', fontWeight: 'bold', fontSize: 16 }
});

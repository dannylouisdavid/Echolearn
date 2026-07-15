import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, SafeAreaView, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, getDocs, writeBatch, addDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../services/auth/AuthContext';
import { Notebook } from '../../../types/schema';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GroupDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const [groupName, setGroupName] = useState("Group");
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Add Modal State
    const [isAddModalVisible, setAddModalVisible] = useState(false);
    const [allLinkedStudents, setAllLinkedStudents] = useState<any[]>([]); // Sourced from 'linkedTeachers'
    const [filteredStudents, setFilteredStudents] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [adding, setAdding] = useState(false);

    // Tagged Notebooks State
    const [taggedNotebooks, setTaggedNotebooks] = useState<Notebook[]>([]);
    const [teacherNotebooks, setTeacherNotebooks] = useState<Notebook[]>([]);
    const [isTagModalVisible, setTagModalVisible] = useState(false);
    const [isCreateNotebookModalVisible, setCreateNotebookModalVisible] = useState(false);
    const [newNotebookTitle, setNewNotebookTitle] = useState('');

    // Add Topic State
    const [isAddTopicModalVisible, setAddTopicModalVisible] = useState(false);
    const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
    const [topicTitle, setTopicTitle] = useState('');
    const [creatingTopic, setCreatingTopic] = useState(false);

    useEffect(() => {
        if (id) fetchGroupDetails();
    }, [id]);

    const fetchGroupDetails = async () => {
        try {
            const groupRef = doc(db, 'groups', id as string);
            const groupSnap = await getDoc(groupRef);
            if (!groupSnap.exists()) {
                Alert.alert("Error", "Group not found");
                router.back();
                return;
            }
            const groupData = groupSnap.data();
            setGroupName(groupData.name || "Unnamed Group");

            const studentIds = groupData.studentIds || [];

            if (studentIds.length > 0) {
                const memberData = [];
                // Optimized: Batch fetch or fetch all users locally? 
                // For < 10 items, loop is fine. For larger, we might need a better index.
                for (const sid of studentIds) {
                    const sSnap = await getDoc(doc(db, 'users', sid));
                    if (sSnap.exists()) memberData.push({ id: sSnap.id, ...sSnap.data() });
                }
                setMembers(memberData);
            } else {
                setMembers([]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // Fetch tagged notebooks for this group
    const fetchTaggedNotebooks = async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, 'notebooks'),
                where('managedBy', '==', user.uid),
                where('assignedGroupIds', 'array-contains', id)
            );
            const snap = await getDocs(q);
            setTaggedNotebooks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notebook)));

            // Load last selected notebook from AsyncStorage
            const lastSelected = await AsyncStorage.getItem(`lastNotebook_group_${id}`);
            if (lastSelected) setSelectedNotebookId(lastSelected);
        } catch (e) {
            console.error(e);
        }
    };

    // Fetch all teacher's notebooks (for tagging modal)
    const fetchTeacherNotebooks = async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, 'notebooks'),
                where('managedBy', '==', user.uid)
            );
            const snap = await getDocs(q);
            // Filter out individual notebooks - they should not appear in group assignments
            const notebooks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notebook));
            const groupNotebooks = notebooks.filter(nb => nb.type !== 'teacher_individual');
            setTeacherNotebooks(groupNotebooks);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        if (id && user) {
            fetchTaggedNotebooks();
        }
    }, [id, user]);

    // Tag notebook to group
    const handleTagNotebook = async (notebookId: string) => {
        try {
            const nbRef = doc(db, 'notebooks', notebookId);
            await updateDoc(nbRef, {
                assignedGroupIds: arrayUnion(id)
            });
            setTagModalVisible(false);
            fetchTaggedNotebooks();
            Alert.alert('Success', 'Notebook tagged to group.');
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to tag notebook.');
        }
    };

    // Untag notebook from group
    const handleUntagNotebook = async (notebookId: string) => {
        Alert.alert('Remove Notebook', 'Remove this notebook from the group?', [
            { text: 'Cancel' },
            {
                text: 'Remove', style: 'destructive', onPress: async () => {
                    try {
                        const nbRef = doc(db, 'notebooks', notebookId);
                        await updateDoc(nbRef, {
                            assignedGroupIds: arrayRemove(id)
                        });
                        fetchTaggedNotebooks();
                    } catch (e) {
                        console.error(e);
                    }
                }
            }
        ]);
    };

    // Create new notebook and auto-tag to group
    const handleCreateNotebook = async () => {
        if (!newNotebookTitle.trim() || !user) return;
        try {
            const docRef = await addDoc(collection(db, 'notebooks'), {
                title: newNotebookTitle.trim(),
                ownerId: user.uid,
                managedBy: user.uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                type: 'teacher_group', // For group assignments, appears in Add Topic modal
                sharedWith: [],
                assignedGroupIds: [id]
            });
            setCreateNotebookModalVisible(false);
            setNewNotebookTitle('');
            fetchTaggedNotebooks();
            Alert.alert('Success', 'Notebook created and tagged to group.');
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to create notebook.');
        }
    };

    // Add Topic to all students in group
    const handleAddTopic = async () => {
        if (!topicTitle.trim() || !selectedNotebookId || !user) return;

        // Confirmation
        Alert.alert(
            'Confirm Assignment',
            `This will create 1 topic in the selected notebook for ${members.length} students in ${groupName}.`,
            [
                { text: 'Cancel' },
                {
                    text: 'Confirm', onPress: async () => {
                        setCreatingTopic(true);
                        try {
                            // Save last selected notebook
                            await AsyncStorage.setItem(`lastNotebook_group_${id}`, selectedNotebookId);

                            // Batch create pages for all students
                            const batch = writeBatch(db);
                            const now = Date.now();

                            // Also update notebook to share with all students
                            const notebookRef = doc(db, 'notebooks', selectedNotebookId);
                            batch.update(notebookRef, {
                                sharedWith: arrayUnion(...members.map(m => m.id))
                            });

                            for (const member of members) {
                                const pageRef = doc(collection(db, 'pages'));
                                batch.set(pageRef, {
                                    notebookId: selectedNotebookId,
                                    title: topicTitle.trim(),
                                    ownerId: member.id, // Student owns their page
                                    managedBy: user.uid, // Teacher manages it
                                    createdAt: now,
                                    updatedAt: now,
                                    plannedTimeMinutes: 0, // Student will set this
                                    isCompleted: false,
                                    repetitionCount: 0,
                                    interval: 0,
                                    rFactor: 0,
                                    attachments: [],
                                    sourceGroupId: id,
                                    visibility: 'teacher',
                                    sharedWith: [user.uid]
                                });

                                // Create notification for student
                                const notifRef = doc(collection(db, 'notifications'));
                                batch.set(notifRef, {
                                    userId: member.id,
                                    title: 'New Topic Assigned',
                                    message: `Your teacher assigned: ${topicTitle.trim()}`,
                                    type: 'topic_assigned',
                                    read: false,
                                    createdAt: now,
                                    relatedId: selectedNotebookId
                                });
                            }

                            await batch.commit();

                            setAddTopicModalVisible(false);
                            setTopicTitle('');
                            Alert.alert('Success', `Created topic for ${members.length} students.`);
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Error', 'Failed to create topics.');
                        } finally {
                            setCreatingTopic(false);
                        }
                    }
                }
            ]
        );
    };

    const openAddModal = async () => {
        if (!user) return;
        setAddModalVisible(true);
        setLoading(true); // Re-use loading or local loading

        try {
            // Fetch all students linked to this teacher
            const q = query(
                collection(db, 'users'),
                where('role', '==', 'student'),
                where('linkedTeachers', 'array-contains', user.uid)
            );
            const snap = await getDocs(q);
            const allStudents = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Filter out those ALREADY in this group
            const currentMemberIds = new Set(members.map(m => m.id));
            const available = allStudents.filter(s => !currentMemberIds.has(s.id));

            setAllLinkedStudents(available);
            setFilteredStudents(available);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to load students.");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (text: string) => {
        setSearchQuery(text);
        if (!text.trim()) {
            setFilteredStudents(allLinkedStudents);
        } else {
            const lower = text.toLowerCase();
            setFilteredStudents(allLinkedStudents.filter(s =>
                s.displayName?.toLowerCase().includes(lower) ||
                s.email?.toLowerCase().includes(lower)
            ));
        }
    };

    const toggleSelection = (studentId: string) => {
        if (selectedStudentIds.includes(studentId)) {
            setSelectedStudentIds(selectedStudentIds.filter(id => id !== studentId));
        } else {
            setSelectedStudentIds([...selectedStudentIds, studentId]);
        }
    };

    const handleConfirmAdd = async () => {
        if (selectedStudentIds.length === 0) return;
        setAdding(true);

        try {
            const batch = writeBatch(db);
            const currentGroupRef = doc(db, 'groups', id as string);

            // 1. For each selected student, find if they are in ANY OTHER group owned by this teacher
            // This requires reading all groups for this teacher. 
            // Optimization: Read all groups for teacher ONCE.
            const groupsQ = query(collection(db, 'groups'), where('ownerId', '==', user?.uid));
            const groupsSnap = await getDocs(groupsQ);
            const titleGroupRef = groupsSnap.docs.find(d => d.id === id); // Current group doc (sanity check)

            // Map of GroupID -> List of students to remove
            const removals: { [gid: string]: string[] } = {};

            for (const sid of selectedStudentIds) {
                // Find visible groups containing this student
                groupsSnap.docs.forEach(gDoc => {
                    const gData = gDoc.data();
                    if (gDoc.id !== id && gData.studentIds?.includes(sid)) {
                        if (!removals[gDoc.id]) removals[gDoc.id] = [];
                        removals[gDoc.id].push(sid);
                    }
                });
            }

            // Execute Removals
            Object.keys(removals).forEach(gid => {
                const gRef = doc(db, 'groups', gid);
                batch.update(gRef, {
                    studentIds: arrayRemove(...removals[gid])
                    // Note: 'members' count update is complex in batch with arrayRemove involving multiple users
                    // We might need to handle count manually if critical, but for now relying on array length is safer if we re-read.
                    // But here we just update array.
                });
            });

            // Execute Add to Current Group
            batch.update(currentGroupRef, {
                studentIds: arrayUnion(...selectedStudentIds)
            });

            // Create notification for each student being added
            const now = Date.now();
            for (const studentId of selectedStudentIds) {
                const notifRef = doc(collection(db, 'notifications'));
                batch.set(notifRef, {
                    userId: studentId,
                    title: 'Added to Group',
                    message: `${user?.displayName || 'Your teacher'} added you to "${groupName}"`,
                    type: 'group_added',
                    read: false,
                    createdAt: now,
                    relatedId: id
                });
            }

            await batch.commit();

            // Success
            setAddModalVisible(false);
            setSelectedStudentIds([]);
            fetchGroupDetails();
            Alert.alert("Success", `Added ${selectedStudentIds.length} students.`);

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to update groups.");
        } finally {
            setAdding(false);
        }
    };

    const handleRemoveStudent = async (studentId: string) => {
        Alert.alert("Remove Student", "Are you sure?", [
            { text: "Cancel" },
            {
                text: "Remove", style: 'destructive', onPress: async () => {
                    try {
                        const groupRef = doc(db, 'groups', id as string);
                        await updateDoc(groupRef, {
                            studentIds: arrayRemove(studentId)
                        });
                        fetchGroupDetails();
                    } catch (e) { console.error(e); }
                }
            }
        ]);
    };

    const renderMember = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <View style={styles.iconBox}>
                <Text style={styles.initials}>{item.displayName?.[0] || 'S'}</Text>
            </View>
            <View style={styles.info}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.email}>{item.email}</Text>
            </View>
            <TouchableOpacity onPress={() => handleRemoveStudent(item.id)}>
                <MaterialCommunityIcons name="trash-can-outline" size={24} color="#F44336" />
            </TouchableOpacity>
        </View>
    );

    const renderSelectable = ({ item }: { item: any }) => {
        const isSelected = selectedStudentIds.includes(item.id);
        return (
            <TouchableOpacity style={[styles.selectCard, isSelected && styles.selectCardActive]} onPress={() => toggleSelection(item.id)}>
                <View style={styles.info}>
                    <Text style={[styles.name, isSelected && { color: '#35c128' }]}>{item.displayName}</Text>
                    <Text style={styles.email}>{item.email}</Text>
                </View>
                {isSelected ? (
                    <MaterialCommunityIcons name="checkbox-marked-circle" size={24} color="#35c128" />
                ) : (
                    <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={24} color="#666" />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Custom Header */}
            <View style={[styles.navHeader, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.navTitle}>{groupName}</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading && !isAddModalVisible ? <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} /> : (
                <ScrollView>
                    {/* Students Header */}
                    <View style={styles.header}>
                        <Text style={styles.subtitle}>{members.length} Students</Text>
                        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
                            <MaterialCommunityIcons name="account-plus" size={20} color="white" />
                            <Text style={styles.addBtnText}>Add Students</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Add Topic Button - Always visible when group has members */}
                    {members.length > 0 && (
                        <TouchableOpacity
                            style={[styles.addBtn, { margin: 15, justifyContent: 'center' }]}
                            onPress={() => {
                                fetchTaggedNotebooks();
                                if (taggedNotebooks.length === 1) setSelectedNotebookId(taggedNotebooks[0].id);
                                setAddTopicModalVisible(true);
                            }}
                        >
                            <MaterialCommunityIcons name="book-plus" size={20} color="white" />
                            <Text style={styles.addBtnText}>Add Topic to Group</Text>
                        </TouchableOpacity>
                    )}

                    {/* Students List */}
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>👨‍🎓 Students</Text>
                    </View>
                    {members.length === 0 ? (
                        <Text style={[styles.empty, { padding: 20 }]}>No students in this group yet.</Text>
                    ) : (
                        members.map(item => (
                            <View key={item.id} style={styles.card}>
                                <View style={styles.iconBox}>
                                    <Text style={styles.initials}>{item.displayName?.[0] || 'S'}</Text>
                                </View>
                                <View style={styles.info}>
                                    <Text style={styles.name}>{item.displayName}</Text>
                                    <Text style={styles.email}>{item.email}</Text>
                                </View>
                                <TouchableOpacity onPress={() => handleRemoveStudent(item.id)}>
                                    <MaterialCommunityIcons name="trash-can-outline" size={24} color="#F44336" />
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </ScrollView>
            )}

            {/* Add Student Modal */}
            <Modal visible={isAddModalVisible} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add Students</Text>
                        {adding ? <ActivityIndicator color="#35c128" /> : (
                            <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.searchBox}>
                        <MaterialCommunityIcons name="magnify" size={20} color="#666" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search students..."
                            placeholderTextColor="#666"
                            value={searchQuery}
                            onChangeText={handleSearch}
                        />
                    </View>

                    <FlatList
                        data={filteredStudents}
                        renderItem={renderSelectable}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={<Text style={styles.empty}>No available students found.</Text>}
                    />

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.confirmBtn, selectedStudentIds.length === 0 && { opacity: 0.5 }]}
                            onPress={handleConfirmAdd}
                            disabled={selectedStudentIds.length === 0 || adding}
                        >
                            <Text style={styles.confirmBtnText}>Add {selectedStudentIds.length} Students</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Tagged Notebooks Section */}
            <Modal visible={false} animationType="none">
                {/* Placeholder to maintain structure */}
            </Modal>

            {/* Tag Notebook Modal */}
            <Modal visible={isTagModalVisible} animationType="slide" presentationStyle="pageSheet">
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Tag Notebook</Text>
                        <TouchableOpacity onPress={() => setTagModalVisible(false)}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={teacherNotebooks.filter(nb => !taggedNotebooks.find(t => t.id === nb.id))}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.list}
                        ListEmptyComponent={<Text style={styles.empty}>No notebooks available to tag. Create one first.</Text>}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={styles.selectCard} onPress={() => handleTagNotebook(item.id)}>
                                <MaterialCommunityIcons name="notebook" size={24} color="#35c128" style={{ marginRight: 15 }} />
                                <Text style={styles.name}>{item.title}</Text>
                            </TouchableOpacity>
                        )}
                    />

                    <View style={styles.footer}>
                        <TouchableOpacity style={styles.confirmBtn} onPress={() => { setTagModalVisible(false); setCreateNotebookModalVisible(true); }}>
                            <MaterialCommunityIcons name="plus" size={20} color="white" />
                            <Text style={styles.confirmBtnText}> Create New Notebook</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Create Notebook Modal */}
            <Modal visible={isCreateNotebookModalVisible} animationType="fade" transparent>
                <View style={styles.overlayModal}>
                    <View style={styles.overlayContent}>
                        <Text style={styles.overlayTitle}>New Notebook</Text>
                        <TextInput
                            style={styles.overlayInput}
                            placeholder="Notebook title..."
                            placeholderTextColor="#666"
                            value={newNotebookTitle}
                            onChangeText={setNewNotebookTitle}
                        />
                        <View style={styles.overlayActions}>
                            <TouchableOpacity onPress={() => setCreateNotebookModalVisible(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.smallBtn} onPress={handleCreateNotebook}>
                                <Text style={styles.smallBtnText}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Add Topic Modal */}
            <Modal visible={isAddTopicModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddTopicModalVisible(false)}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Add Topic</Text>
                        {creatingTopic ? <ActivityIndicator color="#35c128" /> : (
                            <TouchableOpacity onPress={() => setAddTopicModalVisible(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <ScrollView style={styles.list}>
                        {taggedNotebooks.length === 0 ? (
                            <View style={{ alignItems: 'center', marginTop: 30 }}>
                                <Text style={styles.empty}>No notebooks tagged to this group.</Text>
                                <TouchableOpacity
                                    style={[styles.addBtn, { marginTop: 15 }]}
                                    onPress={() => { setAddTopicModalVisible(false); setCreateNotebookModalVisible(true); }}
                                >
                                    <MaterialCommunityIcons name="plus" size={20} color="white" />
                                    <Text style={styles.addBtnText}>Create Notebook</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <>
                                <Text style={styles.labelText}>Select Notebook</Text>
                                {taggedNotebooks.map(nb => (
                                    <TouchableOpacity
                                        key={nb.id}
                                        style={[styles.selectCard, selectedNotebookId === nb.id && styles.selectCardActive]}
                                        onPress={() => setSelectedNotebookId(nb.id)}
                                    >
                                        <MaterialCommunityIcons name="notebook" size={24} color={selectedNotebookId === nb.id ? "#35c128" : "#666"} style={{ marginRight: 15 }} />
                                        <Text style={[styles.name, selectedNotebookId === nb.id && { color: '#35c128' }]}>{nb.title}</Text>
                                        {selectedNotebookId === nb.id && <MaterialCommunityIcons name="check" size={20} color="#35c128" />}
                                    </TouchableOpacity>
                                ))}

                                <Text style={[styles.labelText, { marginTop: 20 }]}>Topic Title</Text>
                                <TextInput
                                    style={styles.overlayInput}
                                    placeholder="e.g. Chapter 5 - Thermodynamics"
                                    placeholderTextColor="#666"
                                    value={topicTitle}
                                    onChangeText={setTopicTitle}
                                />

                                {/* Create New Notebook Option */}
                                <TouchableOpacity
                                    style={[styles.selectCard, { marginTop: 20, justifyContent: 'center' }]}
                                    onPress={() => { setAddTopicModalVisible(false); setCreateNotebookModalVisible(true); }}
                                >
                                    <MaterialCommunityIcons name="plus-circle" size={24} color="#FF9800" style={{ marginRight: 10 }} />
                                    <Text style={{ color: '#FF9800', fontWeight: 'bold' }}>Create New Notebook</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={[styles.confirmBtn, (!selectedNotebookId || !topicTitle.trim()) && { opacity: 0.5 }]}
                            onPress={handleAddTopic}
                            disabled={!selectedNotebookId || !topicTitle.trim() || creatingTopic}
                        >
                            <Text style={styles.confirmBtnText}>Create for {members.length} Students</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    navHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    navTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
    backBtn: { padding: 5 },

    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    subtitle: { color: '#aaa', fontSize: 16 },
    addBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2E7D32', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    addBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },

    list: { padding: 15 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10 },
    iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    initials: { color: 'white', fontWeight: 'bold', fontSize: 18 },
    info: { flex: 1 },
    name: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    email: { color: '#aaa', fontSize: 12 },
    empty: { textAlign: 'center', color: '#666', marginTop: 50 },

    // Modal
    modalContainer: { flex: 1, backgroundColor: '#121212' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
    cancelText: { color: '#FF9800', fontSize: 16 },

    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', margin: 15, padding: 10, borderRadius: 10 },
    searchInput: { flex: 1, marginLeft: 10, color: 'white', fontSize: 16 },

    selectCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: 'transparent' },
    selectCardActive: { borderColor: '#35c128', backgroundColor: 'rgba(53, 193, 40, 0.1)' },

    footer: { padding: 20, borderTopWidth: 1, borderTopColor: '#333', backgroundColor: '#121212' },
    confirmBtn: { backgroundColor: '#2E7D32', padding: 15, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
    confirmBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // Overlay Modal (Create Notebook)
    overlayModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    overlayContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 25, borderRadius: 16 },
    overlayTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 20, textAlign: 'center' },
    overlayInput: { backgroundColor: '#252525', color: 'white', padding: 15, borderRadius: 10, fontSize: 16, marginBottom: 10 },
    overlayActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
    smallBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 8 },
    smallBtnText: { color: 'white', fontWeight: 'bold' },

    // Labels
    labelText: { color: '#aaa', fontSize: 14, marginBottom: 10, fontWeight: '600' },

    // Notebook Section
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#1a1a1a' },
    sectionTitle: { color: '#35c128', fontSize: 14, fontWeight: 'bold' },
    notebookCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 12, borderRadius: 10, marginHorizontal: 15, marginBottom: 8 },
    notebookTitle: { color: 'white', flex: 1, marginLeft: 10, fontSize: 15 }
});

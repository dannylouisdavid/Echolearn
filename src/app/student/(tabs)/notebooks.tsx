import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, SectionList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, addDoc, orderBy, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../services/auth/AuthContext';
import { Notebook } from '../../../types/schema';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NotebooksScreen() {
    const { user, userProfile } = useAuth(); // Added userProfile
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalVisible, setModalVisible] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [creating, setCreating] = useState(false);
    const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

    // Generic Alert State
    const [alertConfig, setAlertConfig] = useState<{ visible: boolean, title: string, message: string, type?: 'error' | 'success' | 'info' }>({
        visible: false, title: '', message: ''
    });

    const showAlert = (title: string, message: string, type: 'error' | 'success' | 'info' = 'info') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    // Sharing State
    const [visibility, setVisibility] = useState<'private' | 'teacher' | 'teacher_parent'>('private');
    const [actionNotebook, setActionNotebook] = useState<Notebook | null>(null);
    const [isActionModalVisible, setActionModalVisible] = useState(false);
    const [isShareModalVisible, setShareModalVisible] = useState(false);
    const [linkedTeachers, setLinkedTeachers] = useState<any[]>([]);
    const [teacherSelection, setTeacherSelection] = useState<string[]>([]);
    const [linkedParents, setLinkedParents] = useState<any[]>([]);
    const [parentSelection, setParentSelection] = useState<string[]>([]);

    const fetchNotebooks = async () => {
        if (!user) return;
        setLoading(true);

        // DEV BYPASS: Return mock data for test user
        if (user.uid === 'test-user-123') {
            // Keep existing or init default
            const generalNotebook: Notebook = {
                id: 'general-mock',
                title: 'General',
                ownerId: user.uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                type: 'general',
                sharedWith: []
            };
            // If checking "local-only" usage, we might want to respect state, but for now force-showing General ensures it's not empty.
            if (notebooks.length === 0) {
                setNotebooks([generalNotebook]);
            }
            setLoading(false);
            return;
        }

        try {
            // Fetch notebooks owned by user
            const ownedQuery = query(
                collection(db, 'notebooks'),
                where('ownerId', '==', user.uid)
            );
            const ownedSnapshot = await getDocs(ownedQuery);
            const ownedData = ownedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notebook));

            // Fetch notebooks shared with user (teacher-created)
            const sharedQuery = query(
                collection(db, 'notebooks'),
                where('sharedWith', 'array-contains', user.uid)
            );
            const sharedSnapshot = await getDocs(sharedQuery);
            const sharedData = sharedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notebook));

            // Combine and dedupe
            const combined = [...ownedData];
            sharedData.forEach(nb => {
                if (!combined.find(existing => existing.id === nb.id)) {
                    combined.push(nb);
                }
            });

            // Client-side sort to avoid index requirement
            combined.sort((a, b) => b.createdAt - a.createdAt);
            setNotebooks(combined);
        } catch (error) {
            console.error("Error fetching notebooks: ", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLinkedUsers = async () => {
        if (!user || user.uid === 'test-user-123') return;
        try {
            const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
            if (!userDoc.empty) {
                const userData = userDoc.docs[0].data();

                // Teachers
                const teacherIds = userData.linkedTeachers || [];
                if (teacherIds.length > 0) {
                    const teachersQuery = query(collection(db, 'users'), where('uid', 'in', teacherIds));
                    const teacherSnaps = await getDocs(teachersQuery);
                    setLinkedTeachers(teacherSnaps.docs.map(t => ({ id: t.id, name: t.data().displayName, ...t.data() })));
                } else {
                    setLinkedTeachers([]);
                }

                // Parents
                const parentIds = userData.linkedParents || [];
                if (parentIds.length > 0) {
                    const parentsQuery = query(collection(db, 'users'), where('uid', 'in', parentIds));
                    const parentSnaps = await getDocs(parentsQuery);
                    setLinkedParents(parentSnaps.docs.map(p => ({ id: p.id, name: p.data().displayName, ...p.data() })));
                } else {
                    setLinkedParents([]);
                }
            }
        } catch (e) { console.log(e); }
    };

    useEffect(() => {
        fetchNotebooks();
        fetchLinkedUsers();
    }, [user]);

    // Open Modal and Default Parent Sharing
    const openCreateModal = () => {
        setNewTitle("");
        setTeacherSelection([]);
        // Default: Select ALL linked parents
        // We can get them from linkedParents state which is populated by fetchLinkedUsers
        // Or directly from userProfile if available immediately
        if (linkedParents.length > 0) {
            setParentSelection(linkedParents.map(p => p.id));
        } else if ((userProfile as any)?.linkedParents) {
            setParentSelection((userProfile as any).linkedParents);
        } else {
            setParentSelection([]);
        }
        setModalVisible(true);
    };

    const handleCreateNotebook = async () => {
        if (!newTitle.trim()) {
            showAlert("Title Required", "Please enter a name for your notebook.", "error");
            return;
        }
        if (!user) return;

        setCreating(true);

        // DEV BYPASS: Create locally immediately
        if (user.uid === 'test-user-123') {
            const mockNotebook: Notebook = {
                id: 'local-' + Date.now(),
                title: newTitle,
                ownerId: user.uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                type: 'student_created',
                sharedWith: [],
                sharedWithParents: parentSelection, // Use selection
                visibility: teacherSelection.length > 0 || parentSelection.length > 0 ? 'teacher_parent' : 'private'
            };
            setNotebooks(prev => [mockNotebook, ...prev]);
            setModalVisible(false);
            setNewTitle("");
            setCreating(false);
            setModalVisible(false);
            setNewTitle("");
            setCreating(false);
            showAlert("Offline Note", "Notebook created locally.", "success");
            return;
        }

        try {
            await addDoc(collection(db, 'notebooks'), {
                title: newTitle,
                ownerId: user.uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                type: 'student_created',
                sharedWith: teacherSelection,
                sharedWithParents: parentSelection,
                visibility: teacherSelection.length > 0 || parentSelection.length > 0 ? 'teacher_parent' : 'private'
                // Using 'teacher_parent' as a catch-all for "shared"
            });
            setModalVisible(false);
            setNewTitle("");
            setTeacherSelection([]);
            setParentSelection([]);
            fetchNotebooks(); // Refresh list
        } catch (error) {
            console.log("Creation failed:", error);
            showAlert("Error", "Could not create notebook.", "error");
        } finally {
            setCreating(false);
        }
    };





    const handleOpenActionMenu = (notebook: Notebook) => {
        setActionNotebook(notebook);

        if (notebook.managedBy) {
            // Teacher Managed: Show Owner/Teacher as selected (Visual Only)
            // We use managedBy ID to show the teacher is "checked"
            setTeacherSelection([notebook.managedBy]);
        } else {
            // Student Managed: Show actual shared teachers
            // Student Managed: Show shared teachers
            setTeacherSelection(notebook.sharedWith || []);
        }

        // Parent Selection
        setParentSelection(notebook.sharedWithParents || []);

        setActionModalVisible(true);
    };

    const handleOpenShare = () => {
        setActionModalVisible(false); // Close action menu
        setShareModalVisible(true);   // Open share modal
    };

    const handleConfirmShare = async () => {
        if (!actionNotebook || !user) return;

        try {
            const nbRef = doc(db, 'notebooks', actionNotebook.id);

            // Logic: If Managed By Teacher, DO NOT modify sharedWith (it contains students)
            if (actionNotebook.managedBy) {
                // Teacher managed: Student can only control Parent sharing? 
                // Actually teacher managed notebooks are usually 'teacher' visibility.
                // If student wants to share with parent, they can add parent permissions.
                // Assuming we allow adding parents to teacher notebooks:
                await updateDoc(nbRef, {
                    sharedWithParents: parentSelection
                });
            } else {
                // Student Managed
                const isShared = teacherSelection.length > 0 || parentSelection.length > 0;
                await updateDoc(nbRef, {
                    sharedWith: teacherSelection,
                    sharedWithParents: parentSelection,
                    visibility: isShared ? 'teacher_parent' : 'private'
                });
            }

            setShareModalVisible(false);
            fetchNotebooks();
        } catch (e) {
            console.error(e);
            showAlert("Error", "Failed to update sharing.", "error");
        }
    };

    const confirmDelete = () => {
        if (!actionNotebook) return;
        setActionModalVisible(false);

        if (actionNotebook.managedBy) {
            Alert.alert("Restricted", "This notebook is managed by your teacher and cannot be deleted until they revoke ownership.");
            return;
        }

        setDeleteConfirmVisible(true);
    };

    const executeDelete = async () => {
        if (!actionNotebook) return;
        setDeleteConfirmVisible(false);

        try {
            await deleteDoc(doc(db, 'notebooks', actionNotebook.id));
            fetchNotebooks();
        } catch (e) {
            showAlert("Error", "Could not delete.", "error");
        }
    };


    const renderNotebook = ({ item }: { item: Notebook }) => {
        const isTeacherOwned = !!item.managedBy;
        const iconColor = isTeacherOwned ? '#2196F3' : '#35c128';

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({ pathname: `/student/notebook/${item.id}`, params: { title: item.title } })}
            >
                <View style={[styles.iconBox, { backgroundColor: isTeacherOwned ? 'rgba(33, 150, 243, 0.15)' : 'rgba(53, 193, 40, 0.15)' }]}>
                    <MaterialCommunityIcons
                        name={isTeacherOwned ? 'notebook-multiple' : 'notebook'}
                        size={28}
                        color={iconColor}
                    />
                </View>
                <View style={styles.cardContent}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Text style={styles.cardTitle}>{item.title}</Text>
                        {isTeacherOwned && <MaterialCommunityIcons name="notebook-multiple" size={16} color="#2196F3" />}
                    </View>
                    <Text style={styles.cardDate}>
                        {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                </View>

                {/* Share Indicators */}
                <View style={styles.shareIndicators}>
                    {(item.sharedWithParents?.length || 0) > 0 ? (
                        <MaterialCommunityIcons name="eye" size={20} color="#2196F3" />
                    ) : (item.visibility === 'teacher' || (item.sharedWith && item.sharedWith.length > 0)) || isTeacherOwned ? (
                        <MaterialCommunityIcons name="eye" size={20} color="#666" />
                    ) : (
                        <MaterialCommunityIcons name="lock" size={16} color="#666" />
                    )}
                </View>

                {/* 3-Dot Menu Replaces Long Press */}
                <TouchableOpacity
                    style={styles.menuBtn}
                    onPress={(e) => {
                        e.stopPropagation();
                        handleOpenActionMenu(item);
                    }}
                >
                    <MaterialCommunityIcons name="dots-vertical" size={24} color="#ccc" />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    // Separate notebooks into teacher-owned and student-owned
    const teacherNotebooks = notebooks.filter(nb => nb.managedBy);
    const studentNotebooks = notebooks.filter(nb => !nb.managedBy);

    const sections = [
        { title: 'Teacher Assigned', data: teacherNotebooks, icon: 'notebook-multiple', color: '#2196F3' },
        { title: 'My Notebooks', data: studentNotebooks, icon: 'notebook', color: '#35c128' }
    ].filter(s => s.data.length > 0);

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <View style={styles.header}>
                <Text style={styles.title}>My Notebooks</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} />
            ) : notebooks.length === 0 ? (
                <Text style={styles.emptyText}>No notebooks found. Create one!</Text>
            ) : (
                <SectionList
                    sections={sections}
                    keyExtractor={item => item.id}
                    renderItem={renderNotebook}
                    renderSectionHeader={({ section }) => (
                        <View style={styles.sectionHeader}>
                            <MaterialCommunityIcons name={section.icon as any} size={18} color={section.color as string} />
                            <Text style={[styles.sectionTitle, { color: section.color as string }]}>{section.title}</Text>
                            <Text style={styles.sectionCount}>{section.data.length}</Text>
                        </View>
                    )}
                    contentContainerStyle={styles.list}
                />
            )}

            <Modal visible={isModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>New Notebook</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Notebook Title"
                            placeholderTextColor="#666"
                            value={newTitle}
                            onChangeText={setNewTitle}
                            autoFocus
                        />

                        <Text style={[styles.visibilityLabel, { marginTop: 15, color: '#fff', fontSize: 16 }]}>Share Notebook</Text>
                        <Text style={[styles.subtext, { marginBottom: 30 }]}>Manage who can view this notebook</Text>

                        <Text style={styles.visibilityLabel}>Teachers</Text>

                        <FlatList
                            data={linkedTeachers}
                            keyExtractor={i => i.id}
                            style={{ maxHeight: 200, marginBottom: 10 }}
                            ListEmptyComponent={<Text style={{ color: '#FF9800' }}>No linked teachers found.</Text>}
                            renderItem={({ item }) => {
                                const selected = teacherSelection.includes(item.id);
                                return (
                                    <TouchableOpacity
                                        style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                        onPress={() => {
                                            if (selected) setTeacherSelection(prev => prev.filter(id => id !== item.id));
                                            else setTeacherSelection(prev => [...prev, item.id]);
                                        }}
                                    >
                                        <MaterialCommunityIcons
                                            name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                            size={24}
                                            color={selected ? "#35c128" : "#888"}
                                        />
                                        <Text style={styles.teacherName}>{item.displayName || item.name || "Teacher"}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />

                        {/* Parent Toggle */}
                        {/* Parents List */}
                        {/* Parents List */}
                        <Text style={[styles.visibilityLabel, { marginTop: 20 }]}>Parents / Guardians</Text>
                        <FlatList
                            data={linkedParents}
                            keyExtractor={i => i.id}
                            style={{ maxHeight: 150, marginBottom: 10 }}
                            ListEmptyComponent={<Text style={{ color: '#FF9800' }}>No linked parents found.</Text>}
                            renderItem={({ item }) => {
                                const selected = parentSelection.includes(item.id);
                                return (
                                    <TouchableOpacity
                                        style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                        onPress={() => {
                                            if (selected) setParentSelection(prev => prev.filter(id => id !== item.id));
                                            else setParentSelection(prev => [...prev, item.id]);
                                        }}
                                    >
                                        <MaterialCommunityIcons
                                            name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                            size={24}
                                            color={selected ? "#35c128" : "#888"}
                                        />
                                        <Text style={styles.teacherName}>{item.displayName || item.name || "Parent"}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />

                        <View style={[styles.modalActions, { marginTop: 40 }]}>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleCreateNotebook} style={styles.createButton} disabled={creating}>
                                <Text style={styles.createText}>{creating ? "Creating..." : "Create"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Action Modal (Long Press) */}
            <Modal visible={isActionModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.actionModalContent}>
                        <Text style={styles.modalTitle}>{actionNotebook?.title}</Text>

                        <TouchableOpacity style={styles.actionButton} onPress={handleOpenShare}>
                            <MaterialCommunityIcons name="share-variant" size={24} color="#2196F3" />
                            <Text style={styles.actionText}>Share Notebook</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionButton} onPress={confirmDelete}>
                            <MaterialCommunityIcons name="trash-can-outline" size={24} color="#ff4444" />
                            <Text style={[styles.actionText, { color: '#ff4444' }]}>Delete Notebook</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.closeButton} onPress={() => setActionModalVisible(false)}>
                            <Text style={styles.closeText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* specific Share Modal */}
            <Modal visible={isShareModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Share Notebook</Text>
                        <Text style={styles.subtext}>Manage who can view and edit this notebook.</Text>

                        {/* Teachers Section */}
                        <Text style={[styles.visibilityLabel, { marginTop: 20 }]}>Teachers</Text>
                        <FlatList
                            data={linkedTeachers}
                            keyExtractor={i => i.id}
                            style={{ maxHeight: 200, marginBottom: 15 }}
                            ListEmptyComponent={<Text style={{ color: '#FF9800' }}>No linked teachers found.</Text>}
                            renderItem={({ item }) => {
                                const selected = teacherSelection.includes(item.id);
                                return (
                                    <TouchableOpacity
                                        style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                        onPress={() => {
                                            if (selected) setTeacherSelection(prev => prev.filter(id => id !== item.id));
                                            else setTeacherSelection(prev => [...prev, item.id]);
                                        }}
                                    >
                                        <MaterialCommunityIcons
                                            name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                            size={24}
                                            color={selected ? "#35c128" : "#888"}
                                        />
                                        <Text style={styles.teacherName}>{item.displayName || item.name || "Teacher"}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />

                        {/* Parents Section */}
                        <Text style={[styles.visibilityLabel, { marginTop: 10 }]}>Parents / Guardians</Text>
                        <FlatList
                            data={linkedParents}
                            keyExtractor={i => i.id}
                            style={{ maxHeight: 150, marginBottom: 10 }}
                            ListEmptyComponent={<Text style={{ color: '#FF9800' }}>No linked parents/guardians found.</Text>}
                            renderItem={({ item }) => {
                                const selected = parentSelection.includes(item.id);
                                return (
                                    <TouchableOpacity
                                        style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                        onPress={() => {
                                            if (selected) setParentSelection(prev => prev.filter(id => id !== item.id));
                                            else setParentSelection(prev => [...prev, item.id]);
                                        }}
                                    >
                                        <MaterialCommunityIcons
                                            name={selected ? "checkbox-marked" : "checkbox-blank-outline"}
                                            size={24}
                                            color={selected ? "#35c128" : "#888"}
                                        />
                                        <Text style={styles.teacherName}>{item.displayName || item.name || "Parent"}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                        />

                        <View style={[styles.modalActions, { marginTop: 20 }]}>
                            <TouchableOpacity onPress={() => setShareModalVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={handleConfirmShare} style={styles.createButton}>
                                <Text style={styles.createText}>Save Changes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal visible={isDeleteConfirmVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.centeredModalContent}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={50} color="#ff4444" style={{ marginBottom: 20 }} />
                        <Text style={styles.modalTitle}>Delete Notebook</Text>
                        <Text style={[styles.subtext, { textAlign: 'center', marginBottom: 24, color: '#ccc', lineHeight: 22 }]}>
                            Are you sure you want to delete "{actionNotebook?.title}"? This cannot be undone.
                        </Text>

                        <View style={styles.modalActionsCentered}>
                            <TouchableOpacity onPress={() => setDeleteConfirmVisible(false)} style={styles.cancelButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={executeDelete} style={[styles.createButton, { backgroundColor: '#d32f2f' }]}>
                                <Text style={styles.createText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Generic Custom Alert Modal */}
            <Modal visible={alertConfig.visible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.centeredModalContent}>
                        <MaterialCommunityIcons
                            name={alertConfig.type === 'error' ? "alert-circle-outline" : alertConfig.type === 'success' ? "check-circle-outline" : "information-outline"}
                            size={50}
                            color={alertConfig.type === 'error' ? "#ff4444" : alertConfig.type === 'success' ? "#4CAF50" : "#2196F3"}
                            style={{ marginBottom: 20 }}
                        />
                        <Text style={styles.modalTitle}>{alertConfig.title}</Text>
                        <Text style={[styles.subtext, { textAlign: 'center', marginBottom: 24, color: '#ccc', lineHeight: 22 }]}>
                            {alertConfig.message}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
                            style={[styles.createButton, { minWidth: 120, alignItems: 'center' }]}
                        >
                            <Text style={styles.createText}>OK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Floating Action Button */}
            <TouchableOpacity style={styles.fab} onPress={openCreateModal} activeOpacity={0.8}>
                <MaterialCommunityIcons name="plus" size={40} color="#fff" />
            </TouchableOpacity>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#121212' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
    list: { paddingBottom: 20 },

    // Section headers for Teacher/Student notebooks
    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, paddingHorizontal: 5, marginTop: 15, marginBottom: 5, gap: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', flex: 1 },
    sectionCount: { fontSize: 12, color: '#666' },

    iconBox: { width: 50, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 12, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },
    cardContent: { flex: 1, marginLeft: 15 },
    cardTitle: { fontSize: 15, fontWeight: '600', color: '#fff' },
    cardDate: { fontSize: 12, color: '#888', marginTop: 4 },
    emptyText: { textAlign: 'center', color: '#666', marginTop: 50 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 20, borderRadius: 12 },
    centeredModalContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 24, borderRadius: 16, alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, color: '#fff' },
    input: { borderWidth: 1, borderColor: '#444', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 16, color: '#fff', backgroundColor: '#222' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15 },
    modalActionsCentered: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 24, width: '100%' },
    cancelButton: { padding: 10 },
    cancelText: { color: '#aaa', fontSize: 16 },
    createButton: { backgroundColor: '#2E7D32', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    createText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    visibilityLabel: { fontSize: 14, fontWeight: '600', color: '#aaa', marginBottom: 6 },
    radioRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8, backgroundColor: '#252525' },
    radioRowActive: { backgroundColor: 'rgba(53, 193, 40, 0.15)', borderWidth: 1, borderColor: '#35c128' },
    radioTextWrap: { marginLeft: 10, flex: 1 },
    radioTitle: { fontWeight: '600', fontSize: 15, color: '#fff' },
    radioSub: { fontSize: 12, color: '#888', marginTop: 2 },

    shareIndicators: { flexDirection: 'row', alignItems: 'center', marginRight: 10 },

    // Menu Btn
    menuBtn: { padding: 5, marginRight: -5 },

    // Action Modal
    actionModalContent: { backgroundColor: '#1e1e1e', width: '80%', padding: 20, borderRadius: 12, alignItems: 'center' },
    actionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, width: '100%', borderBottomWidth: 1, borderBottomColor: '#333' },
    actionText: { marginLeft: 15, fontSize: 18, color: '#fff' },
    closeButton: { marginTop: 15, padding: 10 },
    closeText: { color: '#aaa', fontSize: 16 },

    // Share Modal
    subtext: { color: '#888', marginBottom: 15 },
    teacherRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 8, backgroundColor: '#252525' },
    teacherRowSelected: { backgroundColor: 'rgba(53, 193, 40, 0.15)', borderWidth: 1, borderColor: '#35c128' },
    teacherName: { fontWeight: '600', fontSize: 15, color: '#fff', marginLeft: 10 },
    teacherSub: { fontSize: 12, color: '#888' },

    // FAB
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 30,
        backgroundColor: '#2E7D32',
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        zIndex: 100
    }
});

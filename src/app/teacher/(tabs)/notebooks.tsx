import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { collection, query, where, getDocs, addDoc, doc, getDoc, writeBatch, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../services/auth/AuthContext';
import { Notebook } from '../../../types/schema';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface StudentInfo {
    id: string;
    displayName: string;
    email: string;
}

interface GroupInfo {
    id: string;
    name: string;
    studentIds: string[];
}

export default function TeacherNotebooksScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [groupNotebooks, setGroupNotebooks] = useState<(Notebook & { groupNamesDisplay?: string })[]>([]);
    const [individualNotebooks, setIndividualNotebooks] = useState<(Notebook & { studentName?: string })[]>([]);
    const [studentSharedNotebooks, setStudentSharedNotebooks] = useState<(Notebook & { ownerName?: string })[]>([]);
    const [loading, setLoading] = useState(true);

    // Create Modal State
    const [isCreateModalVisible, setCreateModalVisible] = useState(false);
    const [createStep, setCreateStep] = useState<'type' | 'group' | 'individual'>('type');
    const [newTitle, setNewTitle] = useState('');

    // Student Selection State (for individual)
    const [linkedStudents, setLinkedStudents] = useState<StudentInfo[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [studentSearch, setStudentSearch] = useState('');

    // Group Selection State (for group)
    const [teacherGroups, setTeacherGroups] = useState<GroupInfo[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

    const [creating, setCreating] = useState(false);

    // Dropdown menu state for group notebooks
    const [dropdownNotebook, setDropdownNotebook] = useState<(Notebook & { groupNamesDisplay?: string }) | null>(null);

    useEffect(() => {
        if (user) {
            fetchNotebooks();
            fetchLinkedStudents();
            fetchTeacherGroups();
        }
    }, [user]);

    const fetchNotebooks = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const q = query(
                collection(db, 'notebooks'),
                where('managedBy', '==', user.uid)
            );
            const snap = await getDocs(q);
            const notebooks = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notebook));

            // Separate into group masters and individual
            const group: (Notebook & { groupNamesDisplay?: string })[] = [];
            const individual: (Notebook & { studentName?: string })[] = [];

            for (const nb of notebooks) {
                if (nb.type === 'teacher_individual') {
                    // Get student name for display
                    const studentId = nb.sharedWith?.[0];
                    let studentName = 'Unknown Student';
                    if (studentId) {
                        try {
                            const userDoc = await getDoc(doc(db, 'users', studentId));
                            if (userDoc.exists()) {
                                studentName = userDoc.data().displayName || 'Unnamed';
                            }
                        } catch (e) {
                            console.log('Error fetching student name', e);
                        }
                    }
                    individual.push({ ...nb, studentName });
                } else if (nb.type === 'teacher_group_master' || nb.type === 'teacher_group' || nb.type === 'teacher_created') {
                    // Only show master notebooks (not student copies)
                    if (!nb.sourceNotebookId) {
                        // Generate group names display
                        let groupNamesDisplay = 'No groups assigned';
                        if (nb.assignedGroups && nb.assignedGroups.length > 0) {
                            const names = nb.assignedGroups.map(g => g.groupName);
                            if (names.length === 1) {
                                groupNamesDisplay = names[0];
                            } else if (names.length === 2) {
                                groupNamesDisplay = names.join(' & ');
                            } else {
                                groupNamesDisplay = `${names[0]}, ${names[1]}, +${names.length - 2} more`;
                            }
                        } else if (nb.assignedGroupIds && nb.assignedGroupIds.length > 0) {
                            // Fetch groups to count total students
                            let totalStudents = 0;
                            for (const gid of nb.assignedGroupIds) {
                                try {
                                    const gDoc = await getDoc(doc(db, 'groups', gid));
                                    if (gDoc.exists()) {
                                        const studentIds = gDoc.data().studentIds || [];
                                        totalStudents += studentIds.length;
                                    }
                                } catch (e) { }
                            }
                            groupNamesDisplay = `${totalStudents} students in ${nb.assignedGroupIds.length} group${nb.assignedGroupIds.length > 1 ? 's' : ''}`;
                        }
                        group.push({ ...nb, groupNamesDisplay });
                    }
                }
            }

            setGroupNotebooks(group);
            setIndividualNotebooks(individual);

            // Fetch student-shared notebooks (student-owned where teacher is in sharedWith)
            const sharedQ = query(
                collection(db, 'notebooks'),
                where('sharedWith', 'array-contains', user.uid)
            );
            const sharedSnap = await getDocs(sharedQ);
            const sharedNbs = sharedSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notebook));

            // Filter to only student-owned (not teacher-managed) AND explicitly shared with this teacher
            const studentShared: (Notebook & { ownerName?: string })[] = [];
            for (const nb of sharedNbs) {
                // Only include if this teacher is in sharedWith AND no other teacher manages it
                // Check that the notebook is student-owned and this teacher is a recipient
                if (!nb.managedBy && nb.ownerId !== user.uid && nb.sharedWith?.includes(user.uid)) {
                    // Additional check: Only show if this teacher is the first/primary in sharedWith
                    // This ensures only the intended teacher sees it
                    if (nb.sharedWith[0] === user.uid || (nb.visibility === 'teacher' && nb.sharedWith.includes(user.uid))) {
                        // Get owner name
                        let ownerName = 'Unknown Student';
                        try {
                            const ownerDoc = await getDoc(doc(db, 'users', nb.ownerId));
                            if (ownerDoc.exists()) {
                                ownerName = ownerDoc.data().displayName || 'Unnamed';
                            }
                        } catch (e) { }
                        studentShared.push({ ...nb, ownerName });
                    }
                }
            }
            setStudentSharedNotebooks(studentShared);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchLinkedStudents = async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, 'users'),
                where('role', '==', 'student'),
                where('linkedTeachers', 'array-contains', user.uid)
            );
            const snap = await getDocs(q);
            const students = snap.docs.map(d => ({
                id: d.id,
                displayName: d.data().displayName || 'Unnamed',
                email: d.data().email || ''
            }));
            setLinkedStudents(students);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchTeacherGroups = async () => {
        if (!user) return;
        try {
            const q = query(collection(db, 'groups'), where('ownerId', '==', user.uid));
            const snap = await getDocs(q);
            setTeacherGroups(snap.docs.map(d => ({
                id: d.id,
                name: d.data().name || 'Unnamed Group',
                studentIds: d.data().studentIds || []
            })));
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateNotebook = async () => {
        if (!newTitle.trim() || !user) return;

        setCreating(true);
        try {
            const now = Date.now();

            if (createStep === 'group') {
                if (selectedGroupIds.length === 0) {
                    Alert.alert('Error', 'Select at least one group.');
                    setCreating(false);
                    return;
                }

                // CRITICAL: Re-fetch groups to get fresh student data
                const freshGroupsQ = query(collection(db, 'groups'), where('ownerId', '==', user.uid));
                const freshGroupsSnap = await getDocs(freshGroupsQ);
                const freshGroups: GroupInfo[] = freshGroupsSnap.docs.map(d => ({
                    id: d.id,
                    name: d.data().name || 'Unnamed Group',
                    studentIds: (d.data().studentIds || []) as string[]
                }));

                // Get selected groups from fresh data
                const selectedGroups = freshGroups.filter(g => selectedGroupIds.includes(g.id));
                const assignedGroups = selectedGroups.map(g => ({ groupId: g.id, groupName: g.name }));

                // Collect all unique student IDs from selected groups
                const allStudentIds = new Set<string>();
                selectedGroups.forEach(g => g.studentIds.forEach(sid => allStudentIds.add(sid)));

                // Create master notebook first
                const masterRef = await addDoc(collection(db, 'notebooks'), {
                    title: newTitle.trim(),
                    ownerId: user.uid,
                    managedBy: user.uid,
                    createdAt: now,
                    updatedAt: now,
                    type: 'teacher_group_master',
                    sharedWith: [],
                    assignedGroupIds: selectedGroupIds,
                    assignedGroups: assignedGroups
                });

                // Create copies for each student + notifications
                const batch = writeBatch(db);
                for (const studentId of allStudentIds) {
                    // Student's copy of notebook
                    const studentNbRef = doc(collection(db, 'notebooks'));
                    batch.set(studentNbRef, {
                        title: newTitle.trim(),
                        ownerId: studentId,
                        managedBy: user.uid,
                        createdAt: now,
                        updatedAt: now,
                        type: 'teacher_group',
                        sharedWith: [user.uid],
                        sourceNotebookId: masterRef.id
                    });

                    // Notification for student
                    const notifRef = doc(collection(db, 'notifications'));
                    batch.set(notifRef, {
                        userId: studentId,
                        title: 'New Notebook Assigned',
                        message: `Your teacher assigned: ${newTitle.trim()}`,
                        type: 'notebook_assigned',
                        read: false,
                        createdAt: now,
                        relatedId: masterRef.id
                    });
                }
                await batch.commit();

                Alert.alert('Success', `Created notebook for ${allStudentIds.size} student(s) across ${selectedGroupIds.length} group(s)!`);
            } else if (createStep === 'individual') {
                if (selectedStudentIds.length === 0) {
                    Alert.alert('Error', 'Select at least one student.');
                    setCreating(false);
                    return;
                }
                // Create one notebook per selected student
                for (const studentId of selectedStudentIds) {
                    await addDoc(collection(db, 'notebooks'), {
                        title: newTitle.trim(),
                        ownerId: user.uid,
                        managedBy: user.uid,
                        createdAt: now,
                        updatedAt: now,
                        type: 'teacher_individual',
                        sharedWith: [studentId]
                    });
                }
                Alert.alert('Success', `Created ${selectedStudentIds.length} individual notebook(s)!`);
            }

            // Reset and refresh
            setCreateModalVisible(false);
            setCreateStep('type');
            setNewTitle('');
            setSelectedStudentIds([]);
            setSelectedGroupIds([]);
            fetchNotebooks();
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to create notebook.');
        } finally {
            setCreating(false);
        }
    };

    const toggleStudent = (studentId: string) => {
        setSelectedStudentIds(prev =>
            prev.includes(studentId)
                ? prev.filter(id => id !== studentId)
                : [...prev, studentId]
        );
    };

    const toggleGroup = (groupId: string) => {
        setSelectedGroupIds(prev =>
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    };

    const filteredStudents = linkedStudents.filter(s =>
        s.displayName.toLowerCase().includes(studentSearch.toLowerCase()) ||
        s.email.toLowerCase().includes(studentSearch.toLowerCase())
    );

    // Calculate total students from selected groups
    const selectedGroupsStudentCount = (): number => {
        const studentSet = new Set<string>();
        teacherGroups.filter(g => selectedGroupIds.includes(g.id)).forEach(g => g.studentIds.forEach(s => studentSet.add(s)));
        return studentSet.size;
    };

    // Handle revoke all copies of a group notebook
    const handleRevokeGroupNotebook = (nb: Notebook & { groupNamesDisplay?: string }) => {
        Alert.alert(
            'Revoke All Copies',
            `This will transfer ownership of "${nb.title}" to all students in the linked groups. The notebook will become their private property and you will lose access.\n\nAre you sure?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Revoke All',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // Find all student copies with sourceNotebookId
                            const q = query(
                                collection(db, 'notebooks'),
                                where('sourceNotebookId', '==', nb.id)
                            );
                            const snap = await getDocs(q);

                            const batch = writeBatch(db);

                            // Update each student copy
                            for (const docSnap of snap.docs) {
                                batch.update(doc(db, 'notebooks', docSnap.id), {
                                    managedBy: null,
                                    type: 'student_created',
                                    sharedWith: [],
                                    sourceNotebookId: null
                                });
                            }

                            // Delete the master notebook
                            batch.delete(doc(db, 'notebooks', nb.id));

                            await batch.commit();

                            Alert.alert('Done', `Revoked ${snap.docs.length} notebook copies. Students now own them.`);
                            fetchNotebooks();
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Error', 'Failed to revoke notebooks.');
                        }
                    }
                }
            ]
        );
    };

    const renderGroupNotebook = (nb: Notebook & { groupNamesDisplay?: string }) => (
        <TouchableOpacity
            key={nb.id}
            style={styles.card}
            onPress={() => router.push({ pathname: `/teacher/notebook/${nb.id}`, params: { notebookTitle: nb.title, isMaster: 'true' } })}
        >
            <MaterialCommunityIcons name="notebook-multiple" size={28} color="#35c128" />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{nb.title}</Text>
                <Text style={styles.cardSub}>{nb.groupNamesDisplay}</Text>
            </View>
            <TouchableOpacity
                style={styles.menuBtn}
                onPress={(e) => {
                    e.stopPropagation();
                    setDropdownNotebook(nb);
                }}
            >
                <MaterialCommunityIcons name="dots-vertical" size={24} color="#666" />
            </TouchableOpacity>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
    );

    const renderIndividualNotebook = (nb: Notebook & { studentName?: string }) => (
        <TouchableOpacity
            key={nb.id}
            style={styles.card}
            onPress={() => router.push({ pathname: `/teacher/notebook/${nb.id}`, params: { notebookTitle: nb.title, studentId: nb.sharedWith?.[0] } })}
        >
            <MaterialCommunityIcons name="notebook" size={28} color="#2196F3" />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{nb.title}</Text>
                <Text style={styles.cardSub}>👤 {nb.studentName}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
    );

    const renderStudentSharedNotebook = (nb: Notebook & { ownerName?: string }) => (
        <TouchableOpacity
            key={nb.id}
            style={styles.card}
            onPress={() => router.push({ pathname: `/teacher/notebook/${nb.id}`, params: { notebookTitle: nb.title, studentId: nb.ownerId } })}
        >
            <MaterialCommunityIcons name="notebook" size={28} color="#FF9800" />
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{nb.title}</Text>
                <Text style={styles.cardSub}>👤 {nb.ownerName}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 30 }]}>
                <Text style={styles.headerTitle}>My Notebooks</Text>
            </View>

            {loading ? <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} /> : (
                <ScrollView>
                    {/* Group Notebooks Section */}
                    <View style={styles.sectionHeader}>
                        <MaterialCommunityIcons name="account-group" size={20} color="#35c128" />
                        <Text style={styles.sectionTitle}>Group Notebooks</Text>
                        <Text style={styles.sectionCount}>{groupNotebooks.length}</Text>
                    </View>
                    {groupNotebooks.length === 0 ? (
                        <Text style={styles.empty}>No group notebooks yet.</Text>
                    ) : (
                        groupNotebooks.map(renderGroupNotebook)
                    )}

                    {/* Individual Notebooks Section */}
                    <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                        <MaterialCommunityIcons name="account" size={20} color="#2196F3" />
                        <Text style={[styles.sectionTitle, { color: '#2196F3' }]}>Individual Notebooks</Text>
                        <Text style={styles.sectionCount}>{individualNotebooks.length}</Text>
                    </View>
                    {individualNotebooks.length === 0 ? (
                        <Text style={styles.empty}>No individual notebooks yet.</Text>
                    ) : (
                        individualNotebooks.map(renderIndividualNotebook)
                    )}

                    {/* Student Shared Notebooks Section */}
                    {studentSharedNotebooks.length > 0 && (
                        <>
                            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                                <MaterialCommunityIcons name="notebook" size={20} color="#FF9800" />
                                <Text style={[styles.sectionTitle, { color: '#FF9800' }]}>Student Shared</Text>
                                <Text style={styles.sectionCount}>{studentSharedNotebooks.length}</Text>
                            </View>
                            {studentSharedNotebooks.map(renderStudentSharedNotebook)}
                        </>
                    )}
                </ScrollView>
            )}

            {/* Dropdown Menu Modal */}
            <Modal
                visible={dropdownNotebook !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setDropdownNotebook(null)}
            >
                <TouchableOpacity
                    style={styles.dropdownOverlay}
                    activeOpacity={1}
                    onPress={() => setDropdownNotebook(null)}
                >
                    <View style={styles.dropdownModal}>
                        <Text style={styles.dropdownTitle}>{dropdownNotebook?.title}</Text>
                        <TouchableOpacity
                            style={styles.dropdownItem}
                            onPress={() => {
                                const nb = dropdownNotebook;
                                setDropdownNotebook(null);
                                if (nb) handleRevokeGroupNotebook(nb);
                            }}
                        >
                            <MaterialCommunityIcons name="account-off" size={20} color="#FF5252" />
                            <Text style={styles.dropdownText}>Revoke Ownership from All</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.dropdownCancelItem}
                            onPress={() => setDropdownNotebook(null)}
                        >
                            <Text style={styles.dropdownCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Create Notebook Modal */}
            <Modal
                visible={isCreateModalVisible}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => {
                    if (createStep !== 'type') {
                        setCreateStep('type');
                        setSelectedGroupIds([]);
                        setSelectedStudentIds([]);
                    } else {
                        setCreateModalVisible(false);
                    }
                }}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => {
                            if (createStep !== 'type') {
                                setCreateStep('type');
                                setSelectedGroupIds([]);
                                setSelectedStudentIds([]);
                            } else {
                                setCreateModalVisible(false);
                            }
                        }}>
                            <MaterialCommunityIcons name={createStep === 'type' ? 'close' : 'arrow-left'} size={24} color="white" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>
                            {createStep === 'type' ? 'Create Notebook' : createStep === 'group' ? 'Group Notebook' : 'Individual Notebook'}
                        </Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {createStep === 'type' && (
                        <View style={styles.typeSelection}>
                            <TouchableOpacity style={styles.typeCard} onPress={() => setCreateStep('group')}>
                                <MaterialCommunityIcons name="account-group" size={48} color="#35c128" />
                                <Text style={styles.typeTitle}>Group Notebook</Text>
                                <Text style={styles.typeDesc}>Assign to one or more groups</Text>
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.typeCard} onPress={() => setCreateStep('individual')}>
                                <MaterialCommunityIcons name="account" size={48} color="#2196F3" />
                                <Text style={styles.typeTitle}>Individual Notebook</Text>
                                <Text style={styles.typeDesc}>For 1-on-1 work with students</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {createStep === 'group' && (
                        <ScrollView style={styles.formContainer}>
                            <Text style={styles.label}>Notebook Title</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Physics Assignments"
                                placeholderTextColor="#666"
                                value={newTitle}
                                onChangeText={setNewTitle}
                            />

                            <Text style={[styles.label, { marginTop: 20 }]}>Select Group(s)</Text>
                            {teacherGroups.length === 0 ? (
                                <Text style={styles.empty}>No groups created yet. Create groups first.</Text>
                            ) : (
                                teacherGroups.map(g => (
                                    <TouchableOpacity
                                        key={g.id}
                                        style={[styles.groupCard, selectedGroupIds.includes(g.id) && styles.groupCardActive]}
                                        onPress={() => toggleGroup(g.id)}
                                    >
                                        <MaterialCommunityIcons name="account-group" size={24} color={selectedGroupIds.includes(g.id) ? '#35c128' : '#666'} />
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={styles.groupName}>{g.name}</Text>
                                            <Text style={styles.groupStudents}>{g.studentIds.length} students</Text>
                                        </View>
                                        {selectedGroupIds.includes(g.id) && (
                                            <MaterialCommunityIcons name="check-circle" size={24} color="#35c128" />
                                        )}
                                    </TouchableOpacity>
                                ))
                            )}

                            {selectedGroupIds.length > 0 && (
                                <Text style={styles.selectionSummary}>
                                    📋 {selectedGroupIds.length} group(s) selected • {selectedGroupsStudentCount()} total students
                                </Text>
                            )}

                            <TouchableOpacity
                                style={[styles.submitBtn, (!newTitle.trim() || selectedGroupIds.length === 0) && { opacity: 0.5 }]}
                                onPress={handleCreateNotebook}
                                disabled={!newTitle.trim() || selectedGroupIds.length === 0 || creating}
                            >
                                {creating ? <ActivityIndicator color="white" /> : (
                                    <Text style={styles.submitText}>Create for {selectedGroupsStudentCount()} Students</Text>
                                )}
                            </TouchableOpacity>
                        </ScrollView>
                    )}

                    {createStep === 'individual' && (
                        <View style={styles.formContainer}>
                            <Text style={styles.label}>Notebook Title</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Weekly Progress"
                                placeholderTextColor="#666"
                                value={newTitle}
                                onChangeText={setNewTitle}
                            />

                            <Text style={[styles.label, { marginTop: 20 }]}>Select Student(s)</Text>
                            <View style={styles.searchBox}>
                                <MaterialCommunityIcons name="magnify" size={20} color="#666" />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search students..."
                                    placeholderTextColor="#666"
                                    value={studentSearch}
                                    onChangeText={setStudentSearch}
                                />
                            </View>

                            <FlatList
                                data={filteredStudents}
                                keyExtractor={item => item.id}
                                style={{ maxHeight: 250 }}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[styles.studentCard, selectedStudentIds.includes(item.id) && styles.studentCardActive]}
                                        onPress={() => toggleStudent(item.id)}
                                    >
                                        <View style={styles.avatar}>
                                            <Text style={styles.avatarText}>{item.displayName[0]}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.studentName}>{item.displayName}</Text>
                                            <Text style={styles.studentEmail}>{item.email}</Text>
                                        </View>
                                        {selectedStudentIds.includes(item.id) && (
                                            <MaterialCommunityIcons name="check-circle" size={24} color="#35c128" />
                                        )}
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={<Text style={styles.empty}>No students found.</Text>}
                            />

                            <TouchableOpacity
                                style={[styles.submitBtn, (!newTitle.trim() || selectedStudentIds.length === 0) && { opacity: 0.5 }]}
                                onPress={handleCreateNotebook}
                                disabled={!newTitle.trim() || selectedStudentIds.length === 0 || creating}
                            >
                                {creating ? <ActivityIndicator color="white" /> : (
                                    <Text style={styles.submitText}>Create for {selectedStudentIds.length} Student(s)</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </Modal>

            {/* Floating Action Button */}
            <TouchableOpacity style={styles.fab} onPress={() => setCreateModalVisible(true)} activeOpacity={0.8}>
                <MaterialCommunityIcons name="plus" size={40} color="#fff" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: 'white' },

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
    },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#1a1a1a', gap: 10 },
    sectionTitle: { color: '#35c128', fontSize: 16, fontWeight: 'bold', flex: 1 },
    sectionCount: { color: '#666', fontSize: 14 },

    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, marginHorizontal: 15, marginTop: 10, borderRadius: 12, gap: 15 },
    cardInfo: { flex: 1 },
    cardTitle: { color: 'white', fontSize: 16, fontWeight: '600' },
    cardSub: { color: '#aaa', fontSize: 13, marginTop: 2 },

    empty: { color: '#666', textAlign: 'center', padding: 20 },

    // Modal
    modalContainer: { flex: 1, backgroundColor: '#121212' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#333' },
    modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },

    typeSelection: { flex: 1, justifyContent: 'center', padding: 20, gap: 20 },
    typeCard: { backgroundColor: '#1e1e1e', padding: 30, borderRadius: 16, alignItems: 'center' },
    typeTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', marginTop: 15 },
    typeDesc: { color: '#aaa', fontSize: 14, marginTop: 5 },

    formContainer: { padding: 20 },
    label: { color: '#aaa', fontSize: 14, marginBottom: 10, fontWeight: '600' },
    input: { backgroundColor: '#1e1e1e', color: 'white', padding: 15, borderRadius: 10, fontSize: 16 },

    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 10, borderRadius: 10, marginBottom: 10 },
    searchInput: { flex: 1, marginLeft: 10, color: 'white', fontSize: 16 },

    studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 12, borderRadius: 10, marginBottom: 8, gap: 12 },
    studentCardActive: { backgroundColor: 'rgba(53, 193, 40, 0.15)', borderWidth: 1, borderColor: '#35c128' },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    studentName: { color: 'white', fontWeight: '600' },
    studentEmail: { color: '#aaa', fontSize: 12 },

    groupCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 10, marginBottom: 10 },
    groupCardActive: { backgroundColor: 'rgba(53, 193, 40, 0.15)', borderWidth: 1, borderColor: '#35c128' },
    groupName: { color: 'white', fontWeight: '600', fontSize: 16 },
    groupStudents: { color: '#aaa', fontSize: 12 },
    selectionSummary: { color: '#35c128', textAlign: 'center', marginTop: 15, fontSize: 14 },

    submitBtn: { backgroundColor: '#35c128', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
    submitText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

    // Menu and dropdown modal
    menuBtn: { padding: 8, borderRadius: 8 },
    dropdownOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end'
    },
    dropdownModal: {
        backgroundColor: '#1e1e1e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40
    },
    dropdownTitle: {
        color: '#aaa',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 15
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#2a2a2a',
        borderRadius: 12,
        gap: 12,
        marginBottom: 10
    },
    dropdownText: { color: '#FF5252', fontSize: 16, fontWeight: '500' },
    dropdownCancelItem: {
        padding: 16,
        alignItems: 'center',
        marginTop: 5
    },
    dropdownCancelText: { color: '#aaa', fontSize: 16 }
});

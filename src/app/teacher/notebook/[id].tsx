import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, ScrollView, SectionList } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../services/auth/AuthContext';
import { collection, query, where, getDocs, doc, getDoc, addDoc, writeBatch, arrayUnion, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { Page, Notebook } from '../../../types/schema';
import { calculateRetrievability, formatRetrievability } from '../../../services/sm18/algorithm';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface StudentWithNotebook {
    id: string;
    displayName: string;
    notebookId: string; // Their copy of the notebook
    groupName: string;
}

interface GroupSection {
    title: string;
    data: StudentWithNotebook[];
}

export default function TeacherNotebookDetailScreen() {
    const { id, studentId, notebookTitle, isMaster } = useLocalSearchParams();
    const router = useRouter();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

    // State
    const [loading, setLoading] = useState(true);
    const [notebook, setNotebook] = useState<Notebook | null>(null);
    const [isGroupMaster, setIsGroupMaster] = useState(false);

    // For Group Master: hierarchical view
    const [groupSections, setGroupSections] = useState<GroupSection[]>([]);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set()); // For collapsible sections
    const [dropdownGroup, setDropdownGroup] = useState<GroupSection | null>(null); // Dropdown state for group actions

    // For Individual/Student Copy: pages view
    const [pages, setPages] = useState<Page[]>([]);
    const [studentParents, setStudentParents] = useState<string[]>([]); // IDs of parents

    // Add Topic Modal (for individual notebooks)
    const [isAddTopicVisible, setAddTopicVisible] = useState(false);
    const [topicTitle, setTopicTitle] = useState('');
    const [creating, setCreating] = useState(false);

    // Page Action State
    const [actionPage, setActionPage] = useState<Page | null>(null);
    const [isPageActionModalVisible, setPageActionModalVisible] = useState(false);

    useEffect(() => {
        if (!id || !user) return;
        fetchNotebookAndContent();
    }, [id, user, isMaster]);

    const fetchNotebookAndContent = async () => {
        setLoading(true);
        try {
            // Fetch the notebook first
            const nbDoc = await getDoc(doc(db, 'notebooks', id as string));
            if (!nbDoc.exists()) {
                Alert.alert('Error', 'Notebook not found.');
                router.back();
                return;
            }

            const nb = { id: nbDoc.id, ...nbDoc.data() } as Notebook;
            setNotebook(nb);

            // Determine if this is a group master notebook
            // Student-shared notebooks (not managed by teacher) should NEVER be treated as group masters
            const isStudentOwned = !nb.managedBy || nb.managedBy !== user?.uid;

            // When viewing from student card (studentId provided), always show pages view
            const hasStudentContext = !!studentId;

            const isMasterNotebook = !isStudentOwned && !hasStudentContext && (
                nb.type === 'teacher_group_master' ||
                (nb.type === 'teacher_group' && !nb.sourceNotebookId && nb.assignedGroupIds && nb.assignedGroupIds.length > 0) ||
                (nb.type === 'teacher_created' && nb.assignedGroupIds && nb.assignedGroupIds.length > 0)
            );

            // Only use isMaster param if no student context and notebook is teacher-owned
            setIsGroupMaster(!hasStudentContext && !isStudentOwned && (isMasterNotebook || isMaster === 'true'));

            if (!hasStudentContext && !isStudentOwned && (isMasterNotebook || isMaster === 'true')) {
                // Fetch student copies grouped by their groups
                await fetchGroupedStudents(nb);
            } else {
                // Fetch pages for this specific notebook
                await fetchPages();
                // If viewing a specific student, fetch their parent IDs for sharing logic
                if (studentId) {
                    const sDoc = await getDoc(doc(db, 'users', studentId as string));
                    if (sDoc.exists()) setStudentParents(sDoc.data().parentIds || []);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchGroupedStudents = async (masterNb: Notebook) => {
        try {
            // Fetch groups directly from assignedGroupIds
            const groupIds = masterNb.assignedGroupIds || [];

            if (groupIds.length === 0) {
                // No groups assigned to this notebook
                setGroupSections([]);
                return;
            }

            const sections: GroupSection[] = [];

            for (const gid of groupIds) {
                try {
                    const gDoc = await getDoc(doc(db, 'groups', gid));
                    if (gDoc.exists()) {
                        const groupData = gDoc.data();
                        const groupName = groupData.name || 'Unnamed Group';
                        const studentIds: string[] = groupData.studentIds || [];

                        // Fetch student info for each student in this group
                        const studentsInGroup: StudentWithNotebook[] = [];
                        for (const studentId of studentIds) {
                            let displayName = 'Unknown Student';
                            try {
                                const userDoc = await getDoc(doc(db, 'users', studentId));
                                if (userDoc.exists()) {
                                    displayName = userDoc.data().displayName || 'Unnamed';
                                }
                            } catch (e) { }

                            // Find if this student has a copy of the notebook
                            let studentNotebookId = id as string; // Default to master if no copy

                            // Check for student copy via sourceNotebookId
                            const copyQ = query(
                                collection(db, 'notebooks'),
                                where('sourceNotebookId', '==', id),
                                where('ownerId', '==', studentId)
                            );
                            const copySnap = await getDocs(copyQ);
                            if (!copySnap.empty) {
                                studentNotebookId = copySnap.docs[0].id;
                            }

                            studentsInGroup.push({
                                id: studentId,
                                displayName,
                                notebookId: studentNotebookId,
                                groupName
                            });
                        }

                        if (studentsInGroup.length > 0) {
                            studentsInGroup.sort((a, b) => a.displayName.localeCompare(b.displayName));
                            sections.push({
                                title: groupName,
                                data: studentsInGroup
                            });
                        }
                    }
                } catch (e) { console.log('Error fetching group', e); }
            }

            // Start with all groups collapsed
            setCollapsedGroups(new Set(sections.map(s => s.title)));
            setGroupSections(sections);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchPages = async () => {
        try {
            const q = query(collection(db, 'pages'), where('notebookId', '==', id));
            const snap = await getDocs(q);
            const allPages = snap.docs.map(d => ({ id: d.id, ...d.data() } as Page));

            const visiblePages = allPages.filter(p => {
                // Teacher-created pages are always visible to that teacher
                if (p.managedBy === user?.uid) return true;
                // Pages explicitly shared with teacher
                if (p.sharedWith && p.sharedWith.includes(user?.uid || '')) return true;
                // Pages with 'teacher' visibility where no specific teachers are selected means all teachers can see
                if (p.visibility === 'teacher') return true;
                // Private pages are hidden
                if (p.visibility === 'private') return false;
                // Default: show if no visibility restrictions
                if (!p.visibility) return true;
                return false;
            });

            visiblePages.sort((a, b) => b.createdAt - a.createdAt);
            setPages(visiblePages);
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddTopic = async () => {
        if (!topicTitle.trim() || !user || !studentId) return;

        setCreating(true);
        try {
            const now = Date.now();
            const batch = writeBatch(db);

            // Update notebook to share with student
            const notebookRef = doc(db, 'notebooks', id as string);
            batch.update(notebookRef, {
                sharedWith: arrayUnion(studentId as string)
            });

            // Fetch student parents to enforce sharing
            let parentIds: string[] = [...studentParents]; // Use cached state
            if (parentIds.length === 0 && studentId) {
                // Fallback fetch if state empty (rare)
                const sDoc = await getDoc(doc(db, 'users', studentId as string));
                if (sDoc.exists()) parentIds = sDoc.data().parentIds || [];
            }

            // Create page
            const pageRef = doc(collection(db, 'pages'));
            batch.set(pageRef, {
                notebookId: id,
                title: topicTitle.trim(),
                ownerId: studentId,
                managedBy: user.uid,
                createdAt: now,
                updatedAt: now,
                plannedTimeMinutes: 0,
                isCompleted: false,
                repetitionCount: 0,
                interval: 0,
                rFactor: 0,
                attachments: [],
                visibility: 'teacher',
                sharedWith: [user.uid, ...parentIds] // Enforce sharing with parents
            });

            // Notification
            const notifRef = doc(collection(db, 'notifications'));
            batch.set(notifRef, {
                userId: studentId,
                title: 'New Topic Assigned',
                message: `Your teacher assigned: ${topicTitle.trim()}`,
                type: 'topic_assigned',
                read: false,
                createdAt: now,
                relatedId: id
            });

            await batch.commit();

            setAddTopicVisible(false);
            setTopicTitle('');
            fetchPages();
            Alert.alert('Success', 'Topic created for student.');
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to create topic.');
        } finally {
            setCreating(false);
        }
    };

    const renderStudentCard = ({ item }: { item: StudentWithNotebook }) => {
        // Hide students if their group is collapsed
        if (collapsedGroups.has(item.groupName)) {
            return null;
        }

        return (
            <TouchableOpacity
                style={styles.studentCard}
                onPress={() => router.push({
                    pathname: `/teacher/notebook/${item.notebookId}`,
                    params: { notebookTitle: notebookTitle, studentId: item.id, isMaster: 'false' }
                })}
            >
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{item.displayName[0]}</Text>
                </View>
                <Text style={styles.studentName}>{item.displayName}</Text>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
        );
    };

    const toggleGroupCollapse = (groupTitle: string) => {
        setCollapsedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupTitle)) {
                newSet.delete(groupTitle);
            } else {
                newSet.add(groupTitle);
            }
            return newSet;
        });
    };

    // Handle revoking ownership for a specific group
    const handleRevokeGroupOwnership = (groupTitle: string) => {
        const section = groupSections.find(s => s.title === groupTitle);
        if (!section) return;

        Alert.alert(
            'Remove Ownership',
            `This will transfer ownership of "${notebook?.title}" to all ${section.data.length} student(s) in "${groupTitle}". They will own the notebook privately and you will lose access.\n\nAre you sure?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove Ownership',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const batch = writeBatch(db);

                            // Update each student's notebook copy in this group
                            for (const student of section.data) {
                                if (student.notebookId !== id) {
                                    batch.update(doc(db, 'notebooks', student.notebookId), {
                                        managedBy: null,
                                        type: 'student_created',
                                        sharedWith: [],
                                        sourceNotebookId: null
                                    });
                                }
                            }

                            // Find group ID from notebook's assignedGroups
                            const groupEntry = notebook?.assignedGroups?.find(g => g.groupName === groupTitle);
                            const groupId = groupEntry?.groupId;

                            // Update master notebook to remove this group
                            if (notebook && groupId) {
                                const newGroupIds = (notebook.assignedGroupIds || []).filter(gid => gid !== groupId);
                                const newGroups = (notebook.assignedGroups || []).filter(g => g.groupId !== groupId);

                                if (newGroupIds.length === 0) {
                                    // No groups left, delete the master notebook
                                    batch.delete(doc(db, 'notebooks', id as string));
                                } else {
                                    batch.update(doc(db, 'notebooks', id as string), {
                                        assignedGroupIds: newGroupIds,
                                        assignedGroups: newGroups
                                    });
                                }
                            }

                            await batch.commit();

                            Alert.alert('Done', `Revoked ownership from ${section.data.length} student(s) in "${groupTitle}".`);

                            // Refresh or go back if no groups left
                            if ((notebook?.assignedGroupIds?.length || 0) <= 1) {
                                router.back();
                            } else {
                                fetchNotebookAndContent();
                            }
                        } catch (e) {
                            console.error(e);
                            Alert.alert('Error', 'Failed to revoke ownership.');
                        }
                    }
                }
            ]
        );
    };

    const renderSectionHeader = ({ section }: { section: GroupSection }) => {
        const isCollapsed = collapsedGroups.has(section.title);
        return (
            <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => toggleGroupCollapse(section.title)}
            >
                <MaterialCommunityIcons
                    name={isCollapsed ? "chevron-right" : "chevron-down"}
                    size={20}
                    color="#FF9800"
                />
                <MaterialCommunityIcons name="account-group" size={18} color="#FF9800" />
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{section.data.length} students</Text>
                <TouchableOpacity
                    style={styles.menuBtn}
                    onPress={(e) => {
                        e.stopPropagation();
                        setDropdownGroup(section);
                    }}
                >
                    <MaterialCommunityIcons name="dots-vertical" size={20} color="#666" />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    const handleOpenPageMenu = (page: Page) => {
        setActionPage(page);
        setPageActionModalVisible(true);
    };

    const handleRevokePageOwnership = async () => {
        if (!actionPage) return;
        try {
            await updateDoc(doc(db, 'pages', actionPage.id), {
                managedBy: null,
                sharedWith: [], // Remove teacher access/sharing
                visibility: 'private' // Default to private for student
            });
            setPageActionModalVisible(false);
            fetchPages();
            Alert.alert('Done', 'Ownership transferred to student.');
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to revoke ownership.');
        }
    };

    const renderPage = ({ item }: { item: Page }) => {
        let retention = 0;
        if (item.isCompleted) {
            retention = calculateRetrievability({
                lastReviewDate: item.completedAt,
                interval: item.interval,
                retentionTarget: item.retentionTarget
            });
        }

        const isTeacherManaged = item.managedBy === user?.uid;

        return (
            <TouchableOpacity
                style={styles.pageCard}
                onPress={() => router.push({
                    pathname: `/teacher/page/${item.id}`,
                    params: { studentId: item.ownerId, notebookId: id }
                })}
            >
                <View style={styles.iconBox}>
                    <MaterialCommunityIcons
                        name={item.isCompleted ? "check-circle" : "circle-outline"}
                        size={24}
                        color={item.isCompleted ? "#4CAF50" : "#ccc"}
                    />
                </View>
                <View style={styles.pageInfo}>
                    <Text style={styles.pageTitle}>{item.title}</Text>
                    {item.isCompleted ? (
                        <Text style={styles.pageSub}>
                            Memory: {formatRetrievability(retention)} • Review: {item.nextReviewDate ? new Date(item.nextReviewDate).toLocaleDateString() : 'N/A'}
                        </Text>
                    ) : (
                        <Text style={styles.pageSub}>
                            {item.plannedTimeMinutes ? `${item.plannedTimeMinutes} min planned` : 'Yet to allot time'}
                        </Text>
                    )}
                </View>
                {isTeacherManaged && (
                    <TouchableOpacity
                        style={styles.menuBtn}
                        onPress={(e) => {
                            e.stopPropagation();
                            handleOpenPageMenu(item);
                        }}
                    >
                        <MaterialCommunityIcons name="dots-vertical" size={20} color="#666" />
                    </TouchableOpacity>
                )}
                {!isTeacherManaged && <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />}
            </TouchableOpacity>
        );
    };

    // Calculate total students
    const totalStudents = groupSections.reduce((acc, s) => acc + s.data.length, 0);

    // For pages view: separate into Teacher Created and Student Shared
    const teacherCreatedPages = pages.filter(p => p.managedBy === user?.uid);
    const studentSharedPages = pages.filter(p => !p.managedBy || p.managedBy !== user?.uid);

    const pageSections = [
        { title: 'Teacher Created', data: teacherCreatedPages, icon: 'notebook', color: '#2196F3' },
        { title: 'Student Shared', data: studentSharedPages, icon: 'notebook', color: '#FF9800' }
    ].filter(s => s.data.length > 0);

    const renderPageSectionHeader = ({ section }: { section: { title: string; icon: string; color: string; data: Page[] } }) => (
        <View style={styles.pageSectionHeader}>
            <MaterialCommunityIcons name={section.icon as any} size={18} color={section.color} />
            <Text style={[styles.pageSectionTitle, { color: section.color }]}>{section.title}</Text>
            <Text style={styles.pageSectionCount}>{section.data.length}</Text>
        </View>
    );

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {loading ? <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 50 }} /> : (
                <>
                    {isGroupMaster ? (
                        // Group Master View: Show students grouped by class
                        <>
                            <View style={[styles.summary, { paddingTop: insets.top + 10 }]}>
                                <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 + 5 }]} onPress={() => router.back()}>
                                    <MaterialCommunityIcons name="arrow-left" size={24} color="#aaa" />
                                </TouchableOpacity>
                                <Text style={styles.summaryText}>{totalStudents} Students in {groupSections.length} Group(s)</Text>
                                {/* TEMP: Arrow Test Button */}
                                <TouchableOpacity
                                    style={{ position: 'absolute', right: 16, top: insets.top + 10 + 5, backgroundColor: '#2196F3', padding: 8, borderRadius: 8 }}
                                    onPress={() => router.push('/test/arrows')}
                                >
                                    <MaterialCommunityIcons name="arrow-right-bold" size={20} color="white" />
                                </TouchableOpacity>
                            </View>

                            <SectionList
                                sections={groupSections}
                                keyExtractor={(item) => item.id}
                                renderItem={renderStudentCard}
                                renderSectionHeader={renderSectionHeader}
                                ListEmptyComponent={<Text style={styles.emptyText}>No students have this notebook yet.</Text>}
                                contentContainerStyle={styles.list}
                            />
                        </>
                    ) : (
                        // Individual/Student Copy View: Show pages
                        <>
                            <View style={[styles.summary, { paddingTop: insets.top + 10 }]}>
                                <TouchableOpacity style={[styles.backBtn, { top: insets.top + 10 + 5 }]} onPress={() => router.back()}>
                                    <MaterialCommunityIcons name="arrow-left" size={24} color="#aaa" />
                                </TouchableOpacity>
                                <Text style={styles.summaryText}>{pages.length} Topics</Text>
                            </View>

                            {pages.length === 0 ? (
                                <Text style={styles.emptyText}>No topics in this notebook yet.</Text>
                            ) : (
                                <SectionList
                                    sections={pageSections}
                                    renderItem={renderPage}
                                    renderSectionHeader={renderPageSectionHeader}
                                    keyExtractor={item => item.id}
                                    contentContainerStyle={styles.list}
                                />
                            )}

                            {/* Add Topic FAB (only for individual notebooks with studentId) */}
                            {studentId && (
                                <TouchableOpacity
                                    style={styles.fab}
                                    onPress={() => setAddTopicVisible(true)}
                                >
                                    <MaterialCommunityIcons name="plus" size={28} color="white" />
                                </TouchableOpacity>
                            )}
                        </>
                    )}
                </>
            )}

            {/* Add Topic Modal */}
            <Modal visible={isAddTopicVisible} animationType="fade" transparent onRequestClose={() => setAddTopicVisible(false)}>
                <View style={styles.overlayModal}>
                    <View style={styles.overlayContent}>
                        <Text style={styles.overlayTitle}>Add Topic</Text>

                        <TextInput
                            style={styles.overlayInput}
                            placeholder="Topic title..."
                            placeholderTextColor="#666"
                            value={topicTitle}
                            onChangeText={setTopicTitle}
                        />

                        <View style={styles.overlayActions}>
                            <TouchableOpacity onPress={() => setAddTopicVisible(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            {creating ? (
                                <ActivityIndicator color="#35c128" />
                            ) : (
                                <TouchableOpacity
                                    style={[styles.smallBtn, !topicTitle.trim() && { opacity: 0.5 }]}
                                    onPress={handleAddTopic}
                                    disabled={!topicTitle.trim()}
                                >
                                    <Text style={styles.smallBtnText}>Create</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Group Dropdown Menu Modal */}
            <Modal
                visible={dropdownGroup !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setDropdownGroup(null)}
            >
                <TouchableOpacity
                    style={styles.dropdownOverlay}
                    activeOpacity={1}
                    onPress={() => setDropdownGroup(null)}
                >
                    <View style={styles.dropdownModal}>
                        <Text style={styles.dropdownTitle}>{dropdownGroup?.title}</Text>
                        <TouchableOpacity
                            style={styles.dropdownItem}
                            onPress={() => {
                                const group = dropdownGroup;
                                setDropdownGroup(null);
                                if (group) handleRevokeGroupOwnership(group.title);
                            }}
                        >
                            <MaterialCommunityIcons name="account-off" size={20} color="#FF5252" />
                            <Text style={styles.dropdownText}>Revoke Ownership</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.dropdownCancelItem}
                            onPress={() => setDropdownGroup(null)}
                        >
                            <Text style={styles.dropdownCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Page Action Modal */}
            <Modal visible={isPageActionModalVisible} transparent animationType="slide" onRequestClose={() => setPageActionModalVisible(false)}>
                <TouchableOpacity
                    style={styles.dropdownOverlay}
                    activeOpacity={1}
                    onPress={() => setPageActionModalVisible(false)}
                >
                    <View style={styles.dropdownModal}>
                        <Text style={styles.dropdownTitle}>{actionPage?.title}</Text>

                        <TouchableOpacity
                            style={styles.dropdownItem}
                            onPress={handleRevokePageOwnership}
                        >
                            <MaterialCommunityIcons name="account-off" size={20} color="#FF5252" />
                            <Text style={styles.dropdownText}>Revoke Ownership</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.dropdownCancelItem}
                            onPress={() => setPageActionModalVisible(false)}
                        >
                            <Text style={styles.dropdownCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    summary: { backgroundColor: '#1e1e1e', padding: 20, paddingBottom: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333', position: 'relative' },
    backBtn: { position: 'absolute', left: 15, padding: 8, zIndex: 10 },
    summaryText: { color: '#aaa', fontSize: 16, marginTop: 5 },

    list: { padding: 15 },
    emptyText: { color: '#aaa', textAlign: 'center', marginTop: 50 },

    // Student cards for group view
    sectionHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 12, marginTop: 10, borderRadius: 8, gap: 10 },
    sectionTitle: { color: '#FF9800', fontSize: 16, fontWeight: 'bold', flex: 1 },
    sectionCount: { color: '#666', fontSize: 12 },

    studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, marginTop: 8, borderRadius: 10, gap: 12 },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    studentName: { flex: 1, color: 'white', fontWeight: '600', fontSize: 16 },

    // Page cards for individual view
    pageCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 12, marginBottom: 10, borderRadius: 12 },
    iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#252525', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    pageInfo: { flex: 1 },
    pageTitle: { fontSize: 16, fontWeight: '600', color: 'white' },
    pageSub: { fontSize: 13, color: '#aaa', marginTop: 2 },

    // Page Section Headers
    pageSectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, gap: 10, borderBottomWidth: 1, borderBottomColor: '#333', marginTop: 10 },
    pageSectionTitle: { fontSize: 16, fontWeight: 'bold', flex: 1 },
    pageSectionCount: { fontSize: 12, color: '#666' },

    // FAB
    fab: { position: 'absolute', bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#35c128', justifyContent: 'center', alignItems: 'center', elevation: 5 },

    // Modal
    overlayModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    overlayContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 25, borderRadius: 16 },
    overlayTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 20, textAlign: 'center' },
    overlayInput: { backgroundColor: '#252525', color: 'white', padding: 15, borderRadius: 10, fontSize: 16, marginBottom: 10 },
    overlayActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
    cancelText: { color: '#FF9800', fontSize: 16 },
    smallBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 8 },
    smallBtnText: { color: 'white', fontWeight: 'bold' },

    // Menu button (inside section header)
    menuBtn: { padding: 6, borderRadius: 6, marginLeft: 4 },

    // Dropdown Modal
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

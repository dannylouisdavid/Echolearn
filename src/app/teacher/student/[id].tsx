import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Modal, TextInput, Alert, SectionList } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../services/auth/AuthContext';
import { collection, query, where, getDocs, doc, getDoc, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { Page, Notebook } from '../../../types/schema';
import { calculateRetrievability, formatRetrievability } from '../../../services/sm18/algorithm';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AnalyticsDashboard from '../../../components/AnalyticsDashboard';

export default function StudentDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { user, mockPages } = useAuth();
    const insets = useSafeAreaInsets();

    // State
    const [studentName, setStudentName] = useState("Student");
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);
    const [avgRetention, setAvgRetention] = useState(0);

    // Create Notebook Modal
    const [isCreateModalVisible, setCreateModalVisible] = useState(false);
    const [newNotebookTitle, setNewNotebookTitle] = useState('');

    // Action Menu State
    const [actionNotebook, setActionNotebook] = useState<Notebook | null>(null);
    const [isActionModalVisible, setActionModalVisible] = useState(false);

    // Tab State
    const [activeTab, setActiveTab] = useState<'notebooks' | 'analytics'>('notebooks');

    useEffect(() => {
        if (!id) return;
        fetchStudentData();
    }, [id]);

    const fetchStudentData = async () => {
        if (user?.uid === 'test-user-123') {
            // Mock Data
            setStudentName("Alice Johnson"); // Example
            // Reuse mockPages but pretend they belong to this student
            const studentPages = mockPages || [];
            const studentNotebooks = [
                { id: 'nb1', title: 'Physics 101', ownerId: id as string, type: 'general', createdAt: Date.now() },
                { id: 'nb2', title: 'Calculus II', ownerId: id as string, type: 'general', createdAt: Date.now() }
            ] as Notebook[];

            setPages(studentPages);
            setNotebooks(studentNotebooks);

            // Calc Avg
            if (studentPages.length > 0) {
                const sum = studentPages.reduce((acc, p) => acc + calculateRetrievability({
                    lastReviewDate: p.completedAt,
                    interval: p.interval,
                    retentionTarget: p.retentionTarget
                }), 0);
                setAvgRetention(sum / studentPages.length);
            }

            setLoading(false);
            return;
        }

        try {
            // 1. Get User Profile (Name)
            if (id) {
                const userDoc = await getDoc(doc(db, 'users', id as string));
                if (userDoc.exists()) {
                    setStudentName(userDoc.data().displayName || "Unnamed Student");
                }
            }

            // 2. Get Notebooks - both owned by student AND shared with student (teacher-created)
            const qOwned = query(collection(db, 'notebooks'), where('ownerId', '==', id));
            const ownedSnap = await getDocs(qOwned);
            const ownedNotebooks = ownedSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notebook));

            const qShared = query(collection(db, 'notebooks'), where('sharedWith', 'array-contains', id));
            const sharedSnap = await getDocs(qShared);
            const sharedNotebooks = sharedSnap.docs.map(d => ({ id: d.id, ...d.data() } as Notebook));

            // Combine and dedupe
            const allNotebooks = [...ownedNotebooks];
            sharedNotebooks.forEach(nb => {
                if (!allNotebooks.find(existing => existing.id === nb.id)) {
                    allNotebooks.push(nb);
                }
            });

            // Client-side filter: hide 'private' visibility (for student-owned notebooks)
            const visibleNotebooks = allNotebooks.filter(nb => {
                // Teacher managed notebooks are always visible to teacher
                if (nb.managedBy === user?.uid) return true;

                // Check visibility for student-owned notebooks
                if (nb.ownerId === id) {
                    // Explicit private = hidden
                    if (nb.visibility === 'private') return false;

                    // If visibility set to 'teacher' or shared with this teacher
                    if (nb.visibility === 'teacher' || nb.visibility === 'teacher_parent') return true;
                    if (nb.sharedWith && nb.sharedWith.includes(user?.uid || '')) return true;

                    // No visibility set = private by default
                    if (!nb.visibility) return false;
                }

                return true;
            });
            setNotebooks(visibleNotebooks);

            // Get the IDs of visible notebooks (notebooks teacher has access to)
            const visibleNotebookIds = new Set(visibleNotebooks.map(nb => nb.id));

            // 3. Get ALL Pages for this student
            const qAllPages = query(collection(db, 'pages'), where('ownerId', '==', id));
            const allPagesSnap = await getDocs(qAllPages);
            const allPgs = allPagesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Page));

            // Filter to pages in visible notebooks AND pages the teacher can see
            const visiblePages = allPgs.filter(p => {
                // First check: Page must be in a visible notebook
                if (!visibleNotebookIds.has(p.notebookId)) return false;

                // Second check: Page-level visibility
                if (p.managedBy === user?.uid) return true; // Teacher-created pages
                if (p.sharedWith && p.sharedWith.includes(user?.uid || '')) return true;
                if (p.visibility === 'teacher') return true;
                if (p.visibility === 'private') return false;
                if (!p.visibility) return true; // Default: show if notebook is visible
                return false;
            });
            setPages(visiblePages);

            // 4. Calc Avg Retention (only completed pages from visible notebooks)
            const completedPages = visiblePages.filter(p => p.isCompleted);
            if (completedPages.length > 0) {
                const sum = completedPages.reduce((acc, p) => acc + calculateRetrievability({
                    lastReviewDate: p.completedAt,
                    interval: p.interval,
                    retentionTarget: p.retentionTarget
                }), 0);
                setAvgRetention(sum / completedPages.length);
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenMenu = (notebook: Notebook) => {
        if (notebook.managedBy === user?.uid && notebook.type === 'teacher_individual') {
            setActionNotebook(notebook);
            setActionModalVisible(true);
        }
    };

    const handleRevokeOwnership = async () => {
        if (!actionNotebook) return;

        try {
            await updateDoc(doc(db, 'notebooks', actionNotebook.id), {
                managedBy: null,
                type: 'student_created',
                sharedWith: []  // Remove teacher access - notebook becomes fully private
            });
            setActionModalVisible(false);
            fetchStudentData();
            Alert.alert('Done', 'Ownership transferred to student.');
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to revoke ownership.');
        }
    };

    const renderNotebook = ({ item }: { item: Notebook }) => {
        // Determine notebook type for icons/labels
        const isStudentShared = item.ownerId === id && !item.managedBy;
        const isIndividual = item.type === 'teacher_individual' && item.managedBy === user?.uid;

        // Determine color based on type
        const iconColor = isStudentShared ? '#FF9800' : isIndividual ? '#2196F3' : '#35c128';
        const bgColor = isStudentShared ? 'rgba(255, 152, 0, 0.15)' : isIndividual ? 'rgba(33, 150, 243, 0.15)' : 'rgba(53, 193, 40, 0.15)';

        // Count pages by status for this notebook
        const notebookPages = pages.filter(p => p.notebookId === item.id);
        const yetToPlan = notebookPages.filter(p => !p.isCompleted && (!p.plannedTimeMinutes || p.plannedTimeMinutes === 0)).length;
        const inProgress = notebookPages.filter(p => !p.isCompleted && p.plannedTimeMinutes && p.plannedTimeMinutes > 0).length;
        const complete = notebookPages.filter(p => p.isCompleted).length;

        // Build status string
        const statusParts = [];
        if (yetToPlan > 0) statusParts.push(`${yetToPlan} to plan`);
        if (inProgress > 0) statusParts.push(`${inProgress} in progress`);
        if (complete > 0) statusParts.push(`${complete} complete`);
        const statusText = statusParts.length > 0 ? statusParts.join(' • ') : 'No topics';

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({
                    pathname: `/teacher/notebook/${item.id}`,
                    params: { studentId: id, notebookTitle: item.title }
                })}
            >
                <View style={[styles.iconBox, { backgroundColor: bgColor }]}>
                    <MaterialCommunityIcons
                        name={isStudentShared ? 'notebook' : isIndividual ? 'notebook' : 'notebook-multiple'}
                        size={24}
                        color={iconColor}
                    />
                </View>
                <View style={styles.info}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardSub}>{statusText}</Text>
                </View>
                {/* 3-Dot Menu for Individual Notebooks */}
                {isIndividual && (
                    <TouchableOpacity
                        style={styles.menuBtn}
                        onPress={(e) => {
                            e.stopPropagation();
                            handleOpenMenu(item);
                        }}
                    >
                        <MaterialCommunityIcons name="dots-vertical" size={24} color="#666" />
                    </TouchableOpacity>
                )}
                {!isIndividual && <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />}
            </TouchableOpacity>
        );
    };

    // Classify notebooks into 3 sections
    const studentSharedNotebooks = notebooks.filter(nb => nb.ownerId === id && !nb.managedBy);
    const groupNotebooks = notebooks.filter(nb => nb.managedBy === user?.uid && nb.type !== 'teacher_individual');
    const individualNotebooks = notebooks.filter(nb => nb.type === 'teacher_individual' && nb.managedBy === user?.uid);

    const notebookSections = [
        { title: 'Student Shared', data: studentSharedNotebooks, icon: 'notebook', color: '#FF9800' },
        { title: 'Group Notebooks', data: groupNotebooks, icon: 'notebook-multiple', color: '#35c128' },
        { title: 'Individual Notebooks', data: individualNotebooks, icon: 'notebook', color: '#2196F3' }
    ].filter(s => s.data.length > 0);

    const renderSectionHeader = ({ section }: { section: { title: string; icon: string; color: string; data: Notebook[] } }) => (
        <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name={section.icon as any} size={18} color={section.color} />
            <Text style={[styles.sectionHeaderTitle, { color: section.color }]}>{section.title}</Text>
            <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
        </View>
    );

    // Create teacher-owned notebook for this student
    const handleCreateNotebook = async () => {
        if (!newNotebookTitle.trim() || !user || !id) return;
        try {
            await addDoc(collection(db, 'notebooks'), {
                title: newNotebookTitle.trim(),
                ownerId: user.uid,
                managedBy: user.uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                type: 'teacher_individual', // For 1-on-1 work, not group assignments
                sharedWith: [id as string] // Share with this student
            });
            setCreateModalVisible(false);
            setNewNotebookTitle('');
            fetchStudentData(); // Refresh list
            Alert.alert('Success', 'Notebook created for student.');
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'Failed to create notebook.');
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {loading ? <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 50 }} /> : (
                <>
                    <View style={[styles.summary, { paddingTop: insets.top + 30 }]}>
                        <TouchableOpacity style={[styles.backBtn, { top: insets.top + 30 + 5 }]} onPress={() => router.back()}>
                            <MaterialCommunityIcons name="arrow-left" size={28} color="#aaa" />
                        </TouchableOpacity>
                        <View style={styles.metricBig}>
                            <Text style={styles.metricValBig}>{formatRetrievability(avgRetention)}</Text>
                            <Text style={styles.metricLabelBig}>Avg Retention</Text>
                        </View>

                        {/* Tab Switcher */}
                        <View style={styles.tabContainer}>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'notebooks' && styles.activeTab]}
                                onPress={() => setActiveTab('notebooks')}
                            >
                                <Text style={[styles.tabText, activeTab === 'notebooks' && styles.activeTabText]}>Notebooks</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'analytics' && styles.activeTab]}
                                onPress={() => setActiveTab('analytics')}
                            >
                                <Text style={[styles.tabText, activeTab === 'analytics' && styles.activeTabText]}>Analytics</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {activeTab === 'analytics' ? (
                        <AnalyticsDashboard pages={pages} notebooks={notebooks} />
                    ) : (
                        <>
                            {notebooks.length === 0 ? (
                                <Text style={styles.empty}>No shared notebooks yet.</Text>
                            ) : (
                                <SectionList
                                    sections={notebookSections}
                                    keyExtractor={item => item.id}
                                    renderItem={renderNotebook}
                                    renderSectionHeader={renderSectionHeader}
                                    contentContainerStyle={styles.list}
                                />
                            )}
                            {/* Create Notebook FAB (Only in Notebooks Tab) */}
                            <TouchableOpacity
                                style={styles.fab}
                                onPress={() => setCreateModalVisible(true)}
                            >
                                <MaterialCommunityIcons name="notebook-plus" size={28} color="white" />
                            </TouchableOpacity>
                        </>
                    )}


                </>
            )}

            {/* Create Notebook Modal */}
            <Modal visible={isCreateModalVisible} animationType="fade" transparent onRequestClose={() => setCreateModalVisible(false)}>
                <View style={styles.overlayModal}>
                    <View style={styles.overlayContent}>
                        <Text style={styles.overlayTitle}>New Notebook for {studentName}</Text>

                        <TextInput
                            style={styles.overlayInput}
                            placeholder="Notebook title..."
                            placeholderTextColor="#666"
                            value={newNotebookTitle}
                            onChangeText={setNewNotebookTitle}
                        />

                        <View style={styles.overlayActions}>
                            <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.smallBtn, !newNotebookTitle.trim() && { opacity: 0.5 }]}
                                onPress={handleCreateNotebook}
                                disabled={!newNotebookTitle.trim()}
                            >
                                <Text style={styles.smallBtnText}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Action Bottom Sheet Modal */}
            <Modal visible={isActionModalVisible} transparent animationType="slide" onRequestClose={() => setActionModalVisible(false)}>
                <TouchableOpacity
                    style={styles.dropdownOverlay}
                    activeOpacity={1}
                    onPress={() => setActionModalVisible(false)}
                >
                    <View style={styles.dropdownModal}>
                        <Text style={styles.dropdownTitle}>{actionNotebook?.title}</Text>

                        <TouchableOpacity
                            style={styles.dropdownItem}
                            onPress={handleRevokeOwnership}
                        >
                            <MaterialCommunityIcons name="account-off" size={24} color="#FF5252" />
                            <Text style={styles.dropdownText}>Revoke Ownership</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.dropdownCancelItem}
                            onPress={() => setActionModalVisible(false)}
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
    summary: { backgroundColor: '#1e1e1e', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#333', position: 'relative' },
    backBtn: { position: 'absolute', left: 15, padding: 8, zIndex: 10 },
    metricBig: { alignItems: 'center', marginBottom: 20 },
    metricValBig: { fontSize: 48, fontWeight: 'bold', color: '#35c128', marginTop: 10 },
    metricLabelBig: { fontSize: 14, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 },

    statRow: { flexDirection: 'row', gap: 40 },
    statItem: { alignItems: 'center' },
    statVal: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
    statLabel: { fontSize: 12, color: '#aaa' },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, gap: 10, borderBottomWidth: 1, borderBottomColor: '#333', marginTop: 25 },
    sectionHeaderTitle: { fontSize: 16, fontWeight: 'bold', flex: 1 },
    sectionHeaderCount: { fontSize: 12, color: '#666' },
    list: { paddingHorizontal: 15, paddingBottom: 80 },
    card: { backgroundColor: '#1e1e1e', borderRadius: 10, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(53, 193, 40, 0.2)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    info: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: '600', color: '#fff' },
    cardSub: { fontSize: 13, color: '#aaa' },
    empty: { textAlign: 'center', color: '#666', marginTop: 30 },

    // Menu Btn
    menuBtn: { padding: 5, marginLeft: 10 },

    // FAB
    fab: { position: 'absolute', bottom: 30, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#35c128', justifyContent: 'center', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 2 } },

    // Modal
    overlayModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    overlayContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 25, borderRadius: 16 },
    overlayTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 20, textAlign: 'center' },
    overlayInput: { backgroundColor: '#252525', color: 'white', padding: 15, borderRadius: 10, fontSize: 16, marginBottom: 10 },
    overlayActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15 },
    cancelText: { color: '#FF9800', fontSize: 16 },
    smallBtn: { backgroundColor: '#2E7D32', paddingHorizontal: 25, paddingVertical: 10, borderRadius: 8 },
    smallBtnText: { color: 'white', fontWeight: 'bold' },

    // Bottom Sheet
    dropdownOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    dropdownModal: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 },
    dropdownTitle: { color: '#aaa', fontSize: 14, textAlign: 'center', marginBottom: 15 },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#2a2a2a', borderRadius: 12, gap: 12, marginBottom: 10 },
    dropdownText: { color: '#FF5252', fontSize: 16, fontWeight: '500' },
    dropdownCancelItem: { padding: 16, alignItems: 'center', marginTop: 5 },
    dropdownCancelText: { color: '#aaa', fontSize: 16 },

    // Tabs
    tabContainer: { flexDirection: 'row', width: '100%', marginTop: 20 },
    tab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: '#35c128' },
    tabText: { color: '#888', fontWeight: '600', fontSize: 16 },
    activeTabText: { color: '#35c128' }
});

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput, Alert, ActivityIndicator, SectionList } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, onSnapshot, addDoc, doc, getDoc, orderBy, deleteDoc, updateDoc, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../services/auth/AuthContext';
import { Page, Notebook } from '../../../types/schema';

import { calculateRetrievability, formatRetrievability } from '../../../services/sm18/algorithm';
import { CustomAlert } from '../../../components/CustomAlert';

export default function NotebookDetailScreen() {
    const { id } = useLocalSearchParams();
    const params = useLocalSearchParams();
    const userContext = useAuth();
    const { user, userProfile } = userContext; // Added userProfile
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [notebook, setNotebook] = useState<Notebook | null>(null);
    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);

    // Creation State
    const [isModalVisible, setModalVisible] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [plannedTime, setPlannedTime] = useState("");
    const [creating, setCreating] = useState(false);

    // Creation-time Sharing State (for New Topic modal)
    const [newPageTeacherSelection, setNewPageTeacherSelection] = useState<string[]>([]);
    const [newPageParentSelection, setNewPageParentSelection] = useState<string[]>([]); // CHANGED: array instead of boolean

    // Page Sharing State
    const [actionPage, setActionPage] = useState<Page | null>(null);
    const [isPageActionModalVisible, setPageActionModalVisible] = useState(false);
    const [isPageShareModalVisible, setPageShareModalVisible] = useState(false);
    const [linkedTeachers, setLinkedTeachers] = useState<any[]>([]);
    const [linkedParents, setLinkedParents] = useState<any[]>([]); // NEW: Store parent details
    const [pageTeacherSelection, setPageTeacherSelection] = useState<string[]>([]);
    const [pageParentSelection, setPageParentSelection] = useState<string[]>([]);

    const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

    // Alert State
    const [alertState, setAlertState] = useState<{
        visible: boolean;
        title: string;
        message: string;
        buttons?: { text: string; onPress: () => void; style?: 'cancel' | 'default' | 'destructive'; autoClose?: boolean }[]
    }>({ visible: false, title: '', message: '' });

    const showAlert = (title: string, message: string, buttons?: { text: string; onPress: () => void; style?: 'cancel' | 'default' | 'destructive'; autoClose?: boolean }[]) => {
        setAlertState({ visible: true, title, message, buttons });
    };

    useEffect(() => {
        if (!id || !user) return;

        // 1. Fetch Notebook Details
        getDoc(doc(db, 'notebooks', id as string)).then(snap => {
            if (snap.exists()) {
                setNotebook({ id: snap.id, ...snap.data() } as Notebook);
            }
        });

        // 2. Listen for Pages
        // DEV BYPASS
        if (user.uid === 'test-user-123') {
            // Merge mock pages from context
            if (userContext.mockPages) {
                const notebookPages = userContext.mockPages.filter(p => p.notebookId === id);
                setPages(notebookPages);
            }
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'pages'),
            where('notebookId', '==', id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pgs: Page[] = [];
            snapshot.forEach((doc) => {
                pgs.push({ id: doc.id, ...doc.data() } as Page);
            });
            // Client-side sort
            pgs.sort((a, b) => b.createdAt - a.createdAt);
            setPages(pgs);
            setLoading(false);
        }, (err) => {
            console.error(err);
            setLoading(false);
        });

        return unsubscribe;
    }, [id, user, userContext.mockPages]);

    // Fetch Linked Teachers
    useEffect(() => {
        const fetchLinkedUsers = async () => {
            if (!user || user.uid === 'test-user-123') return;
            try {
                const userDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', user.uid)));
                if (!userDoc.empty) {
                    const userData = userDoc.docs[0].data();

                    // Fetch Teachers
                    const teacherIds = userData.linkedTeachers || [];
                    if (teacherIds.length > 0) {
                        const teachersQuery = query(collection(db, 'users'), where('uid', 'in', teacherIds));
                        const teacherSnaps = await getDocs(teachersQuery);
                        setLinkedTeachers(teacherSnaps.docs.map(t => ({ id: t.id, name: t.data().displayName, ...t.data() })));
                    } else {
                        setLinkedTeachers([]);
                    }

                    // Fetch Parents (NEW)
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
        fetchLinkedUsers();
    }, [user]);

    const handleCreatePage = async () => {
        if (!newTitle.trim()) {
            showAlert("Required", "Please enter a topic title.");
            return;
        }
        const minutes = parseInt(plannedTime);
        if (!plannedTime || isNaN(minutes) || minutes <= 0) {
            showAlert("Required", "Please enter valid planned minutes.");
            return;
        }

        setCreating(true);

        // DEV BYPASS
        if (user?.uid === 'test-user-123') {
            const mockPageId = 'local-page-' + Date.now();
            const newPage: Page = {
                id: mockPageId,
                notebookId: id as string,
                title: newTitle,
                ownerId: user.uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                plannedTimeMinutes: minutes,
                isCompleted: false,
                repetitionCount: 0,
                interval: 0,
                rFactor: 0,
                attachments: []
            };
            setModalVisible(false);
            setNewTitle("");
            setPlannedTime("");
            setCreating(false);
            // Pass notebookId and title so PageScreen knows where to save it
            router.push({
                pathname: `/student/page/${mockPageId}`,
                params: { notebookId: id, initialTitle: newTitle }
            });
            return;
        }

        try {
            // Left blank intentionally, relying on fetched state


            const docRef = await addDoc(collection(db, 'pages'), {
                notebookId: id,
                title: newTitle,
                ownerId: user?.uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                plannedTimeMinutes: minutes,
                isCompleted: false,
                repetitionCount: 0,
                interval: 0,
                rFactor: 0,
                attachments: [],
                // Use the creation-time selections
                sharedWith: newPageTeacherSelection,
                sharedWithParents: newPageParentSelection, // Use array selection
                visibility: newPageTeacherSelection.length > 0 ? 'teacher' : 'private'
            });
            setModalVisible(false);
            setNewTitle("");
            setPlannedTime("");
            // Navigate to the new page immediately
            router.push(`/student/page/${docRef.id}`);
        } catch (error) {
            Alert.alert("Error", "Could not create topic.");
        } finally {
            setCreating(false);
        }
    };

    const handleDeletePage = async (pageId: string) => {
        Alert.alert(
            "Delete Topic",
            "Are you sure you want to delete this topic? This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        // FUTURE TODO: Check if page.ownerId !== user.uid (Teacher created)
                        // User requested: "teacher should have the capability to revoke ownership... which afterwards same student can decide to delete"
                        // For now, allow all deletions.

                        // DEV BYPASS
                        if (user?.uid === 'test-user-123') {
                            setPages(prev => prev.filter(p => p.id !== pageId));
                            return;
                        }

                        try {
                            await deleteDoc(doc(db, 'pages', pageId));
                            // Snapshot listener will update list automatically
                        } catch (e) {
                            console.error(e);
                            Alert.alert("Error", "Failed to delete topic.");
                        }
                    }
                }
            ]
        );
    };

    const handleLongPressPage = (page: Page) => {
        setActionPage(page);
        setPageTeacherSelection(page.sharedWith || []);
        setPageParentSelection(page.sharedWithParents || []); // Initialize array
        setPageActionModalVisible(true);
    };

    const handleOpenPageShare = () => {
        setPageActionModalVisible(false);
        setPageShareModalVisible(true);
    };

    const handleConfirmPageShare = async () => {
        if (!actionPage || !user) return;
        try {
            const pageRef = doc(db, 'pages', actionPage.id);
            const newVisibility = pageTeacherSelection.length > 0 ? 'teacher' : 'private';

            await updateDoc(pageRef, {
                sharedWith: pageTeacherSelection,
                sharedWithParents: pageParentSelection, // Use array selection
                visibility: newVisibility
            });
            Alert.alert("Success", "Sharing settings updated.");
            setPageShareModalVisible(false);
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to update sharing.");
        }
    };

    const confirmDeletePage = () => {
        if (!actionPage) return;
        setPageActionModalVisible(false);

        if (actionPage.managedBy) {
            Alert.alert("Restricted", "This topic was created by your teacher and cannot be deleted.");
            return;
        }

        // Show custom modal instead of Alert
        setDeleteConfirmVisible(true);
    };

    const executeDeletePage = async () => {
        if (!actionPage) return;
        setDeleteConfirmVisible(false);

        if (user?.uid === 'test-user-123') {
            setPages(prev => prev.filter(p => p.id !== actionPage.id));
            return;
        }
        try {
            await deleteDoc(doc(db, 'pages', actionPage.id));
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to delete topic.");
        }
    };


    const renderPageItem = ({ item }: { item: Page }) => {
        const isActive = !!item.currentSessionStart;
        const isPaused = !isActive && !item.isCompleted && (item.actualTimeMinutes || 0) > 0;

        let retention = 0;
        if (item.isCompleted) {
            retention = calculateRetrievability({
                lastReviewDate: item.completedAt,
                interval: item.interval,
                retentionTarget: item.retentionTarget
            });
        }

        return (
            <TouchableOpacity
                style={[
                    styles.card,
                    isActive && { borderLeftColor: '#35c128', borderLeftWidth: 4, backgroundColor: 'rgba(76, 175, 80, 0.1)' },
                    isPaused && { borderLeftColor: '#FF9800', borderLeftWidth: 4 }
                ]}
                onPress={() => router.push(`/student/page/${item.id}`)}
            >
                <View style={[styles.iconContainer, isActive && { marginRight: 11 }]}>
                    {isActive ? (
                        <MaterialCommunityIcons name="timer-sand" size={28} color="#35c128" />
                    ) : isPaused ? (
                        <MaterialCommunityIcons name="pause-circle" size={28} color="#FF9800" />
                    ) : (
                        <MaterialCommunityIcons
                            name={item.isCompleted ? "check-circle" : "circle-outline"}
                            size={28}
                            color={item.isCompleted ? "#4CAF50" : "#ccc"}
                        />
                    )}
                </View>
                <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    {item.nextReviewDate && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 10 }}>
                            <Text style={styles.cardSubtitle}>
                                Review: {new Date(item.nextReviewDate).toLocaleDateString()}
                            </Text>
                            {/* Memory Strength Badge */}
                            <View style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 10, color: '#2E7D32', fontWeight: 'bold' }}>
                                    Mem: {formatRetrievability(retention)}
                                </Text>
                            </View>
                        </View>
                    )}
                    {!item.isCompleted && (
                        <Text style={[
                            styles.cardSubtitle,
                            isActive && { color: '#35c128', fontWeight: 'bold' },
                            isPaused && { color: '#FF9800', fontWeight: 'bold' }
                        ]}>
                            {isActive ? "Timer Running..." : isPaused ? "Session Paused" : item.plannedTimeMinutes && item.plannedTimeMinutes > 0 ? `${item.plannedTimeMinutes} min planned` : "Yet to be planned"}
                        </Text>
                    )}
                </View>
                {/* Share Indicator - grey for one share type, blue for both */}
                <View style={{ marginRight: 8 }}>
                    {(() => {
                        const hasTeacher = (item.sharedWith && item.sharedWith.length > 0) || (item.visibility && item.visibility !== 'private');
                        const hasParent = item.sharedWithParents && item.sharedWithParents.length > 0;

                        if (hasTeacher && hasParent) {
                            // Shared with BOTH teacher and parent - blue
                            return <MaterialCommunityIcons name="eye" size={18} color="#2196F3" />;
                        } else if (hasTeacher || hasParent) {
                            // Shared with ONE of them - grey
                            return <MaterialCommunityIcons name="eye" size={18} color="#666" />;
                        } else {
                            // Private - lock
                            return <MaterialCommunityIcons name="lock" size={16} color="#666" />;
                        }
                    })()}
                </View>

                {/* Options Menu Button (Replacing Chevron) */}
                <TouchableOpacity onPress={() => handleLongPressPage(item)} style={{ padding: 4 }}>
                    <MaterialCommunityIcons name="dots-vertical" size={24} color="#ccc" />
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    // Separate pages into teacher-owned and student-owned
    const teacherPages = pages.filter(p => p.managedBy);
    const studentPages = pages.filter(p => !p.managedBy);

    const pageSections = [
        { title: 'Teacher Assigned', data: teacherPages, icon: 'notebook-multiple', color: '#2196F3' },
        { title: 'My Topics', data: studentPages, icon: 'notebook', color: '#35c128' }
    ].filter(s => s.data.length > 0);

    const renderSectionHeader = ({ section }: { section: { title: string; icon: string; color: string; data: Page[] } }) => (
        <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name={section.icon as any} size={18} color={section.color} />
            <Text style={[styles.sectionTitle, { color: section.color }]}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top + 30 }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{(params.title as string) || notebook?.title || "Notebook"}</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} />
            ) : pages.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No topics yet.</Text>
                    <Text style={styles.emptySubtext}>Add a topic to start learning.</Text>
                </View>
            ) : (
                <SectionList
                    sections={pageSections}
                    renderItem={renderPageItem}
                    renderSectionHeader={renderSectionHeader}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.list}
                />
            )}

            <TouchableOpacity style={styles.fab} onPress={() => {
                // Pre-populate sharing based on notebook's current sharing status
                if (notebook?.managedBy) {
                    // Teacher-managed: Pre-select manager and all parents
                    setNewPageTeacherSelection([notebook.managedBy]);
                    setNewPageParentSelection(linkedParents.map(p => p.id));
                } else if (notebook?.sharedWith && notebook.sharedWith.length > 0) {
                    // Shared notebook: Pre-select those teachers and all parents
                    setNewPageTeacherSelection([...notebook.sharedWith]);
                    setNewPageParentSelection(linkedParents.map(p => p.id));
                } else {
                    // Student-created notebook
                    setNewPageTeacherSelection([]);

                    // Default Parent Sharing to ON if not private
                    const isPrivate = notebook?.visibility === 'private';
                    if (!isPrivate && linkedParents.length > 0) {
                        setNewPageParentSelection(linkedParents.map(p => p.id));
                    } else {
                        setNewPageParentSelection([]);
                    }
                }
                setModalVisible(true);
            }}>
                <MaterialCommunityIcons name="plus" size={30} color="white" />
                <Text style={styles.fabText}>Add Topic</Text>
            </TouchableOpacity>

            <Modal visible={isModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>New Topic</Text>

                        <Text style={styles.label}>Topic Title</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. Thermodynamics"
                            placeholderTextColor="#ccc"
                            value={newTitle}
                            onChangeText={setNewTitle}
                        />

                        <Text style={styles.label}>Planned Time (Minutes)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="e.g. 45"
                            placeholderTextColor="#ccc"
                            value={plannedTime}
                            onChangeText={setPlannedTime}
                            keyboardType="numeric"
                        />

                        {/* Sharing Section - Conditional lock */}
                        {notebook?.managedBy ? (
                            <View style={{ marginTop: 15, padding: 10, backgroundColor: 'rgba(53, 193, 40, 0.1)', borderRadius: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                                    <MaterialCommunityIcons name="lock" size={16} color="#35c128" />
                                    <Text style={{ color: '#35c128', fontWeight: 'bold', marginLeft: 8 }}>Sharing Locked</Text>
                                </View>
                                <Text style={{ color: '#aaa', fontSize: 13 }}>
                                    This topic will be automatically shared with your teacher and parent because this is a teacher-managed notebook.
                                </Text>
                            </View>
                        ) : (
                            <>
                                <Text style={[styles.label, { marginTop: 15, color: '#fff', fontSize: 16 }]}>Share Page</Text>
                                <Text style={styles.subtext}>Manage who gets to view this page</Text>

                                <Text style={styles.label}>Teachers</Text>
                                <FlatList
                                    data={linkedTeachers}
                                    keyExtractor={i => i.id}
                                    style={{ maxHeight: 150 }}
                                    ListEmptyComponent={<Text style={{ color: '#FF9800' }}>No linked teachers found.</Text>}
                                    renderItem={({ item }) => {
                                        const selected = newPageTeacherSelection.includes(item.id);
                                        return (
                                            <TouchableOpacity
                                                style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                                onPress={() => {
                                                    if (selected) setNewPageTeacherSelection(prev => prev.filter(tid => tid !== item.id));
                                                    else setNewPageTeacherSelection(prev => [...prev, item.id]);
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

                                <Text style={[styles.label, { marginTop: 20 }]}>Parents / Guardians</Text>
                                <FlatList
                                    data={linkedParents}
                                    keyExtractor={i => i.id}
                                    style={{ maxHeight: 150 }}
                                    ListEmptyComponent={<Text style={{ color: '#FF9800' }}>No linked parents/guardians found.</Text>}
                                    renderItem={({ item }) => {
                                        const selected = newPageParentSelection.includes(item.id);
                                        return (
                                            <TouchableOpacity
                                                style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                                onPress={() => {
                                                    if (selected) setNewPageParentSelection(prev => prev.filter(pid => pid !== item.id));
                                                    else setNewPageParentSelection(prev => [...prev, item.id]);
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
                            </>
                        )}

                        <View style={[styles.modalActions, { marginTop: 40 }]}>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleCreatePage} style={styles.createButton} disabled={creating}>
                                <Text style={styles.createText}>{creating ? "Creating..." : "Start Learning"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Page Action Modal (Long Press) */}
            <Modal visible={isPageActionModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.actionModalContent}>
                        <Text style={styles.modalTitle}>{actionPage?.title}</Text>

                        <TouchableOpacity
                            style={[styles.actionButton, actionPage?.managedBy && { opacity: 0.5 }]}
                            onPress={() => {
                                if (actionPage?.managedBy) {
                                    Alert.alert("Locked", "Sharing settings for this topic are managed by your teacher.");
                                } else {
                                    handleOpenPageShare();
                                }
                            }}
                        >
                            <MaterialCommunityIcons name={actionPage?.managedBy ? "lock" : "share-variant"} size={24} color={actionPage?.managedBy ? "#aaa" : "#2196F3"} />
                            <Text style={[styles.actionText, actionPage?.managedBy && { color: '#aaa' }]}>
                                {actionPage?.managedBy ? "Sharing Locked" : "Share Topic"}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionButton} onPress={confirmDeletePage}>
                            <MaterialCommunityIcons name="trash-can-outline" size={24} color="#ff4444" />
                            <Text style={[styles.actionText, { color: '#ff4444' }]}>Delete Topic</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.closeButton} onPress={() => setPageActionModalVisible(false)}>
                            <Text style={styles.closeText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Page Share Modal */}
            <Modal visible={isPageShareModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={[styles.modalTitle, { textAlign: 'left' }]}>Share Page</Text>
                        <Text style={[styles.subtext, { textAlign: 'left', marginBottom: 30 }]}>Manage who gets to view this page</Text>

                        <View style={{ width: '100%' }}>
                            <Text style={styles.label}>Teachers</Text>
                            <FlatList
                                data={linkedTeachers}
                                keyExtractor={i => i.id}
                                style={{ maxHeight: 200, marginBottom: 10 }}
                                ListEmptyComponent={<Text style={{ color: '#FF9800' }}>No linked teachers found.</Text>}
                                renderItem={({ item }) => {
                                    const selected = pageTeacherSelection.includes(item.id);
                                    return (
                                        <TouchableOpacity
                                            style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                            onPress={() => {
                                                if (selected) setPageTeacherSelection(prev => prev.filter(tid => tid !== item.id));
                                                else setPageTeacherSelection(prev => [...prev, item.id]);
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
                            <Text style={[styles.label, { marginTop: 20 }]}>Parents / Guardians</Text>
                            {!linkedParents.length ? (
                                <Text style={{ color: '#FF9800' }}>No linked parents found.</Text>
                            ) : (
                                <FlatList
                                    data={linkedParents}
                                    keyExtractor={i => i.id}
                                    style={{ maxHeight: 200, marginBottom: 10 }}
                                    renderItem={({ item }) => {
                                        const selected = pageParentSelection.includes(item.id);
                                        return (
                                            <TouchableOpacity
                                                style={[styles.teacherRow, selected && styles.teacherRowSelected]}
                                                onPress={() => {
                                                    if (selected) setPageParentSelection(prev => prev.filter(pid => pid !== item.id));
                                                    else setPageParentSelection(prev => [...prev, item.id]);
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
                            )}

                        </View>

                        <View style={[styles.modalActions, { marginTop: 40 }]}>
                            <TouchableOpacity onPress={() => setPageShareModalVisible(false)} style={styles.cancelButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleConfirmPageShare} style={styles.createButton}>
                                <Text style={styles.createText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>


            {/* Delete Confirmation Modal */}
            < Modal visible={isDeleteConfirmVisible} transparent animationType="fade" >
                <View style={styles.modalOverlay}>
                    <View style={styles.centeredModalContent}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={50} color="#ff4444" style={{ marginBottom: 20 }} />
                        <Text style={styles.modalTitle}>Delete Topic</Text>
                        <Text style={[styles.subtext, { textAlign: 'center', marginBottom: 24, color: '#ccc', lineHeight: 22 }]}>
                            Are you sure you want to delete "{actionPage?.title}"? This cannot be undone.
                        </Text>

                        <View style={styles.modalActionsCentered}>
                            <TouchableOpacity onPress={() => setDeleteConfirmVisible(false)} style={styles.cancelButton}>
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={executeDeletePage} style={[styles.createButton, { backgroundColor: '#d32f2f' }]}>
                                <Text style={styles.createText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal >


            <CustomAlert
                visible={alertState.visible}
                title={alertState.title}
                message={alertState.message}
                onClose={() => setAlertState(prev => ({ ...prev, visible: false }))}
                buttons={alertState.buttons}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 20 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 15 },
    headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff', flex: 1 },
    list: { paddingBottom: 100 },

    // Section headers for Teacher/Student pages
    sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginBottom: 5, gap: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
    sectionTitle: { fontSize: 15, fontWeight: 'bold', flex: 1 },
    sectionCount: { fontSize: 12, color: '#666' },

    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, elevation: 2 },
    iconContainer: { marginRight: 15 },
    cardContent: { flex: 1 },
    cardTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },
    cardSubtitle: { fontSize: 13, color: '#aaa', marginTop: 4 },
    fab: { position: 'absolute', bottom: 45, right: 40, backgroundColor: '#2E7D32', borderRadius: 30, paddingVertical: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
    fabText: { color: 'white', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
    emptyText: { fontSize: 18, fontWeight: 'bold', color: '#666' },
    emptySubtext: { fontSize: 14, color: '#555', marginTop: 5 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 24, borderRadius: 16 },
    centeredModalContent: { backgroundColor: '#1e1e1e', width: '85%', padding: 24, borderRadius: 16, alignItems: 'center' },
    modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 16, textAlign: 'center', color: '#fff' },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: '#aaa' },
    input: { borderWidth: 1, borderColor: '#333', padding: 12, borderRadius: 8, marginBottom: 20, fontSize: 16, backgroundColor: '#252525', color: '#fff' },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 24, width: '100%' },
    modalActionsCentered: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 24, width: '100%' },
    cancelButton: { padding: 10 },
    cancelText: { color: '#aaa', fontSize: 16 },
    createButton: { backgroundColor: '#2E7D32', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
    createText: { color: 'white', fontWeight: 'bold', fontSize: 16 },

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
    teacherSub: { fontSize: 12, color: '#888' }
});

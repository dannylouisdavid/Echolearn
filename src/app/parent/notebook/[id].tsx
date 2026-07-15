import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { Page } from '../../../types/schema';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function ParentNotebookScreen() {
    const { id, studentId, notebookTitle } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const [pages, setPages] = useState<Page[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) fetchPages();
    }, [id]);

    const fetchPages = async () => {
        try {
            const q = query(
                collection(db, 'pages'),
                where('notebookId', '==', id),
                // orderBy('createdAt', 'desc') // Improve ordering if needed
            );
            const snap = await getDocs(q);
            const allPages = snap.docs.map(d => ({ id: d.id, ...d.data() } as Page));

            // Filtering visibility (Redundant if handled by Student Screen strictness, but good for safety)
            const visiblePages = allPages.filter(p => {
                if (p.visibility === 'private') return false;
                if (p.visibility === 'teacher') return false;
                if (p.visibility === 'teacher_student') return false;
                return true;
            });

            // Sort by completed at desc, then created at
            visiblePages.sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt));

            setPages(visiblePages);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const renderPage = ({ item }: { item: Page }) => {
        const isCompleted = item.isCompleted;
        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => router.push({
                    pathname: `/parent/page/${item.id}`,
                    params: { pageTitle: item.title, studentId: studentId }
                })}
            >
                <MaterialCommunityIcons
                    name={isCompleted ? "check-circle" : "circle-outline"}
                    size={24}
                    color={isCompleted ? "#35c128" : "#666"}
                />
                <View style={styles.info}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.date}>
                        {isCompleted ? `Mastered ${new Date(item.completedAt!).toLocaleDateString()}` : 'In Progress'}
                    </Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity style={[styles.backBtn, { top: insets.top + 15 }]} onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color="#aaa" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{notebookTitle || 'Notebook'}</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={pages}
                    keyExtractor={p => p.id}
                    renderItem={renderPage}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={<Text style={styles.empty}>No visible notes in this notebook.</Text>}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    backBtn: { position: 'absolute', left: 15, padding: 5, zIndex: 10 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', maxWidth: '70%' },

    list: { padding: 20 },
    card: { backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 15 },
    info: { flex: 1 },
    title: { color: 'white', fontSize: 16, fontWeight: '500' },
    date: { color: '#888', fontSize: 12, marginTop: 2 },
    empty: { color: '#666', textAlign: 'center', marginTop: 30 }
});

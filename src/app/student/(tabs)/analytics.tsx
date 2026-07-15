import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../services/auth/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { Page } from '../../../types/schema';
import AnalyticsDashboard from '../../../components/AnalyticsDashboard';

export default function StudentAnalyticsScreen() {
    const { user, mockPages } = useAuth();
    const insets = useSafeAreaInsets();
    const [pages, setPages] = useState<Page[]>([]);
    const [notebooks, setNotebooks] = useState<any[]>([]); // Using any[] to avoid import issues, but typically Notebook[]
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, [user]);

    const fetchData = async () => {
        if (!user) return;

        if (user.uid === 'test-user-123') {
            setPages(mockPages || []);
            setNotebooks([{ id: 'nb1', title: 'Mock Notebook' }]);
            setLoading(false);
            return;
        }

        try {
            // Fetch ALL pages for this student
            // Query pages where ownerId == user.uid
            // Or get all notebooks owned by user, then all pages. 
            // Better: If pages have ownerId or we query by notebook owner.
            // Schema check: Page has `notebookId`. Notebook has `ownerId`.
            // We need to fetch all notebooks owned by student first.

            // Fetch Notebooks owned by student
            const nbQuery = query(collection(db, 'notebooks'), where('ownerId', '==', user.uid));
            const nbSnap = await getDocs(nbQuery);
            const fetchedNotebooks = nbSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Also fetch shared notebooks? For now sticking to owned as per previous logic, 
            // but if we want shared, we need another query.
            // Let's stick to owned for now to match current scope, 
            // but we MUST store the notebook objects for the dashboard.

            setNotebooks(fetchedNotebooks);

            // Also check for shared notebooks? 
            // "Pages taken into account... for students... all of the pages"
            // Does this mean pages they created? Or pages in shared notebooks too?
            // Usually "all pages" implies everything they have worked on.
            // If they are a student, they might have read-only access to teacher notebooks?
            // If they complete a page in a teacher notebook, it should count?
            // Let's assume we want ALL pages where the student is the *user* who completed it?
            // But Page schema structure: `completedAt` is on the Page object.
            // If multiple students use the same Page doc, this is a conflict.
            // However, typically in this MVP logic, maybe copies are made?
            // Or maybe pages are 1:1? 

            // For now, let's Stick to the pattern used in Parent view:
            // It fetches pages by Notebook ID.

            if (fetchedNotebooks.length > 0) {
                // Firestore 'in' query limit is 10. If > 10 notebooks, this breaks.
                // Better pattern: collectionGroup or fetch all pages and filter?
                // Or fetch pages for each notebook.

                // Safe approach: Fetch all pages where `ownerId` (if exists on page) matches?
                // Page schema doesn't have ownerId usually.
                // Let's iterate notebooks.

                const allPages: Page[] = [];
                for (const nb of fetchedNotebooks) {
                    const pQuery = query(collection(db, 'pages'), where('notebookId', '==', nb.id));
                    const pSnap = await getDocs(pQuery);
                    pSnap.forEach(d => allPages.push({ id: d.id, ...d.data() } as Page));
                }
                setPages(allPages);
            } else {
                setPages([]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
            <View style={styles.header}>
                <Text style={styles.title}>My Analytics</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#35c128" style={{ marginTop: 50 }} />
            ) : (
                <AnalyticsDashboard pages={pages} notebooks={notebooks} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#121212' },
    header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
    title: { color: 'white', fontSize: 28, fontWeight: 'bold' }
});

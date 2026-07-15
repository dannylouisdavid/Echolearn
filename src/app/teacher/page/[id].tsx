import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig';
import { useAuth } from '../../../services/auth/AuthContext';
import { Page } from '../../../types/schema';
import { calculateRetrievability, formatRetrievability } from '../../../services/sm18/algorithm';
import Svg, { Path, Circle, Rect, Line, Polygon } from 'react-native-svg';
import CommentsModal from '../../../components/CommentsModal';

type ShapeType = 'circle' | 'rect' | 'triangle' | 'line' | 'arrow' | 'dotted-line' | 'dotted-arrow';

interface CanvasElement {
    id: string;
    type: 'path' | 'text' | 'shape';
    color: string;
    d?: string;
    text?: string;
    x?: number;
    y?: number;
    shapeType?: ShapeType;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
}

export default function TeacherPageViewScreen() {
    const params = useLocalSearchParams();
    const { id, pageTitle } = params;
    const router = useRouter();
    const { user } = useAuth();
    const insets = useSafeAreaInsets();

    const [page, setPage] = useState<Page | null>(null);
    const [elements, setElements] = useState<CanvasElement[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCommentsVisible, setCommentsVisible] = useState(false); // NEW

    useEffect(() => {
        if (!id) return;
        fetchPageData();
    }, [id]);

    const fetchPageData = async () => {
        if (user?.uid === 'test-user-123') {
            setPage({
                id: id as string,
                notebookId: 'mock-nb',
                title: (pageTitle as string) || 'Sample Topic',
                ownerId: 'student-123',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                plannedTimeMinutes: 30,
                isCompleted: true,
                completedAt: Date.now() - 86400000,
                interval: 3,
                repetitionCount: 2,
                rFactor: 2.5,
                retentionTarget: 0.9,
                attachments: []
            });
            setElements([
                { id: '1', type: 'text', text: 'Sample notes from student', x: 50, y: 100, color: '#000' },
                { id: '2', type: 'path', d: 'M 100 200 L 300 200', color: '#2196F3' }
            ]);
            setLoading(false);
            return;
        }

        try {
            const docRef = doc(db, 'pages', id as string);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                setPage({ id: snap.id, ...data } as Page);

                if (data.contentJson) {
                    try {
                        const parsed = JSON.parse(data.contentJson);
                        if (Array.isArray(parsed)) {
                            setElements(parsed);
                        } else if (parsed.elements) {
                            setElements(parsed.elements);
                        }
                    } catch (e) {
                        console.log('Failed to parse content:', e);
                    }
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const retention = page?.isCompleted ? calculateRetrievability({
        lastReviewDate: page.completedAt,
        interval: page.interval,
        retentionTarget: page.retentionTarget
    }) : 0;

    // Determine status: Yet to Plan, In Progress, or Completed
    const getStatus = () => {
        if (page?.isCompleted) return 'completed';
        if (page?.plannedTimeMinutes && page.plannedTimeMinutes > 0) return 'in_progress';
        return 'yet_to_plan';
    };
    const status = getStatus();

    // Shape rendering (matching student page)
    const renderShape = (el: CanvasElement) => {
        const sx = el.startX || 0;
        const sy = el.startY || 0;
        const ex = el.endX || 0;
        const ey = el.endY || 0;
        const color = el.color;
        const width = ex - sx;
        const height = ey - sy;

        const commonProps = { stroke: color, strokeWidth: 2, fill: "none" };

        const getArrowHead = (x1: number, y1: number, x2: number, y2: number) => {
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = 15;
            const p1 = `${x2},${y2}`;
            const p2 = `${x2 - headLen * Math.cos(angle - Math.PI / 6)},${y2 - headLen * Math.sin(angle - Math.PI / 6)}`;
            const p3 = `${x2 - headLen * Math.cos(angle + Math.PI / 6)},${y2 - headLen * Math.sin(angle + Math.PI / 6)}`;
            return <Polygon points={`${p1} ${p2} ${p3}`} fill={color} />;
        };

        switch (el.shapeType) {
            case 'rect':
                return <Rect key={el.id} x={Math.min(sx, ex)} y={Math.min(sy, ey)} width={Math.abs(width)} height={Math.abs(height)} {...commonProps} />;
            case 'circle':
                return <Circle key={el.id} cx={(sx + ex) / 2} cy={(sy + ey) / 2} r={Math.max(Math.abs(width), Math.abs(height)) / 2} {...commonProps} />;
            case 'line':
                return <Line key={el.id} x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} />;
            case 'dotted-line':
                return <Line key={el.id} x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} strokeDasharray="5, 5" />;
            case 'triangle':
                const midX = (sx + ex) / 2;
                const pts = `${midX},${sy} ${sx},${ey} ${ex},${ey}`;
                return <Polygon key={el.id} points={pts} {...commonProps} />;
            case 'arrow':
                return (
                    <React.Fragment key={el.id}>
                        <Line x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} />
                        {getArrowHead(sx, sy, ex, ey)}
                    </React.Fragment>
                );
            case 'dotted-arrow':
                return (
                    <React.Fragment key={el.id}>
                        <Line x1={sx} y1={sy} x2={ex} y2={ey} {...commonProps} strokeDasharray="5, 5" />
                        {getArrowHead(sx, sy, ex, ey)}
                    </React.Fragment>
                );
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <Stack.Screen options={{ title: 'Loading...' }} />
                <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 50 }} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Read-Only Banner with Back Button */}
            <View style={[styles.readOnlyBanner, { paddingTop: insets.top + 10 }]}>
                <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { top: insets.top + 10 + 5 }]}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color="#666" />
                </TouchableOpacity>
                <MaterialCommunityIcons name="eye" size={16} color="#666" />
                <Text style={styles.readOnlyText}>View Only — Student's Notes</Text>

                <TouchableOpacity
                    style={{ position: 'absolute', right: 15, padding: 5, backgroundColor: '#eee', borderRadius: 6 }}
                    onPress={() => setCommentsVisible(true)}
                >
                    <MaterialCommunityIcons name="comment-text-multiple" size={18} color="#2196F3" />
                </TouchableOpacity>
            </View>

            {/* FULL CANVAS - Matching student layout */}
            <View style={styles.canvasLayer} pointerEvents="none">
                <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                    {elements.map((el) => {
                        if (el.type === 'path') {
                            return <Path key={el.id} d={el.d!} stroke={el.color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
                        }
                        if (el.type === 'shape') {
                            return <React.Fragment key={el.id}>{renderShape(el)}</React.Fragment>;
                        }
                        return null;
                    })}
                </Svg>

                {/* Render Text Elements */}
                {elements.map((el) => {
                    if (el.type === 'text') {
                        return (
                            <View key={el.id} style={{ position: 'absolute', left: el.x, top: el.y }} pointerEvents="none">
                                <Text style={{ fontSize: 16, color: el.color }}>{el.text}</Text>
                            </View>
                        );
                    }
                    return null;
                })}

                {elements.length === 0 && (
                    <View style={styles.emptyCanvas}>
                        <MaterialCommunityIcons name="note-text-outline" size={48} color="#ccc" />
                        <Text style={styles.emptyText}>No notes added yet</Text>
                    </View>
                )}
            </View>

            <View style={styles.statsFooter}>
                <View style={styles.statItem}>
                    <MaterialCommunityIcons
                        name={status === 'completed' ? "check-circle" : status === 'in_progress' ? "clock-outline" : "calendar-blank"}
                        size={20}
                        color={status === 'completed' ? "#4CAF50" : status === 'in_progress' ? "#FF9800" : "#999"}
                    />
                    <Text style={styles.statText}>
                        {status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : 'Yet to Plan'}
                    </Text>
                </View>
                {status === 'completed' && (
                    <View style={styles.statItem}>
                        <MaterialCommunityIcons name="calendar" size={20} color="#2196F3" />
                        <Text style={styles.statText}>
                            Next: {page?.nextReviewDate ? new Date(page.nextReviewDate).toLocaleDateString() : 'N/A'}
                        </Text>
                    </View>
                )}
                <View style={styles.statItem}>
                    <MaterialCommunityIcons name="timer-outline" size={20} color="#9C27B0" />
                    <Text style={styles.statText}>{page?.actualTimeMinutes || 0} min spent</Text>
                </View>
            </View>

            {/* Comments Modal */}
            <CommentsModal
                visible={isCommentsVisible}
                onClose={() => setCommentsVisible(false)}
                threadId={id as string}
                userRole="teacher"
                allowedChannels={['teacher_student']}
            />
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    headerTitle: { alignItems: 'center', marginTop: 20 },
    title: { fontSize: 16, fontWeight: 'bold' },
    subtitle: { fontSize: 12, color: '#4CAF50' },

    readOnlyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f5f5f5', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
    readOnlyText: { color: '#666', fontSize: 12 },
    backButton: { position: 'absolute', left: 15, padding: 5 },

    // Canvas Layer - Full screen like student view
    canvasLayer: { flex: 1, backgroundColor: '#fff' },

    emptyCanvas: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyText: { color: '#ccc', marginTop: 10, fontSize: 16 },

    statsFooter: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#f9f9f9', paddingVertical: 12, paddingBottom: 35, borderTopWidth: 1, borderTopColor: '#eee' },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statText: { color: '#333', fontSize: 13 }
});

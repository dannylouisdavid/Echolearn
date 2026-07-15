import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path, Line, Text as SvgText, Circle, G } from 'react-native-svg';
import { Page } from '../types/schema';
import { calculateRetrievability } from '../services/sm18/algorithm';

interface AnalyticsModalProps {
    visible: boolean;
    onClose: () => void;
    page: Page;
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({ visible, onClose, page }) => {
    if (!visible) return null;

    // 1. Calculate Curve Data
    // R = exp( (t / I) * ln(T) )
    // We want to plot from t=0 (last review) to t=Interval*1.5 (future)

    // If interval is 0, we can't really plot a curve (it's flat 0 or just undefined). 
    // Handle edge case: New Page (Interval=0)
    const interval = page.interval || 1;
    const target = page.retentionTarget || 0.9;
    const lastReview = page.completedAt || Date.now();

    const width = Dimensions.get('window').width - 60; // Padding
    const height = 200;
    const padding = 20;

    // Time scale: Show up to 1.5x the current interval (or at least 7 days for visibility)
    const maxDays = Math.max(interval * 1.5, 7);

    // Generate Path
    let pathD = `M ${padding} ${height - padding}`; // Start at 0,0 (bottom left) ?? Wait, t=0 means R=100% (top)

    // Coordinates:
    // X: padding -> width-padding (0 days -> maxDays)
    // Y: padding -> height-padding (100% -> 0%)

    const getX = (days: number) => padding + (days / maxDays) * (width - 2 * padding);
    const getY = (retention: number) => (height - padding) - (retention * (height - 2 * padding));

    // t=0, R=1
    pathD = `M ${getX(0)} ${getY(1)}`;

    for (let t = 0.1; t <= maxDays; t += maxDays / 50) {
        // R = exp( (t / I) * ln(T) )
        // Using strict formula: R = exp( (t / interval) * Math.log(target) )
        const r = Math.exp((t / interval) * Math.log(target));
        pathD += ` L ${getX(t)} ${getY(r)}`;
    }

    // Current State Point
    const now = Date.now();
    const elapsedDays = (now - lastReview) / (1000 * 60 * 60 * 24);
    const currentR = calculateRetrievability({ lastReviewDate: lastReview, interval, retentionTarget: target });

    return (
        <View style={[styles.container, StyleSheet.absoluteFill, { zIndex: 1000 }]}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Memory Analytics</Text>
                    <Pressable onPress={onClose}>
                        <MaterialCommunityIcons name="close" size={24} color="white" />
                    </Pressable>
                </View>

                <ScrollView>
                    {/* Summary Cards */}
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <Text style={styles.statVal}>{Math.round(currentR * 100)}%</Text>
                            <Text style={styles.statLabel}>Current Strength</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statVal}>{interval}d</Text>
                            <Text style={styles.statLabel}>Stability (Interval)</Text>
                        </View>
                        <View style={styles.statCard}>
                            <Text style={styles.statVal}>{page.repetitionCount || 0}</Text>
                            <Text style={styles.statLabel}>Repetitions</Text>
                        </View>
                    </View>

                    {/* Graph */}
                    <Text style={styles.sectionTitle}>Forgetting Curve</Text>
                    <View style={styles.graphContainer}>
                        <Svg width={width} height={height}>
                            {/* Axes */}
                            <Line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#666" strokeWidth="2" />
                            <Line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#666" strokeWidth="2" />

                            {/* Curve */}
                            <Path d={pathD} stroke="#35c128" strokeWidth="3" fill="none" />

                            {/* Current Point */}
                            {elapsedDays <= maxDays && (
                                <Circle
                                    cx={getX(elapsedDays)}
                                    cy={getY(currentR)}
                                    r="5"
                                    fill="#FF9800"
                                    stroke="white"
                                    strokeWidth="2"
                                />
                            )}

                            {/* Target Line (90%) */}
                            <Line
                                x1={padding}
                                y1={getY(target)}
                                x2={width - padding}
                                y2={getY(target)}
                                stroke="#444"
                                strokeDasharray="5, 5"
                            />
                            <SvgText x={width - padding - 30} y={getY(target) - 5} fill="#888" fontSize="10">Target</SvgText>

                            {/* Labels */}
                            <SvgText x={padding + 5} y={padding + 10} fill="#888" fontSize="10">100%</SvgText>
                            <SvgText x={width - padding - 20} y={height - 5} fill="#888" fontSize="10">{Math.round(maxDays)}d</SvgText>
                        </Svg>
                    </View>

                    <Text style={styles.explanation}>
                        The green curve shows your predicted memory decay. The orange dot is where you are now. Review before it drops below your target!
                    </Text>

                    {/* History List (Simple) */}
                    <Text style={styles.sectionTitle}>Review History</Text>
                    <View style={styles.historyCard}>
                        <View style={styles.historyRow}>
                            <Text style={styles.historyText}>Created</Text>
                            <Text style={styles.historyDate}>{new Date(page.createdAt).toLocaleDateString()}</Text>
                        </View>
                        {page.isCompleted && (
                            <View style={styles.historyRow}>
                                <Text style={styles.historyText}>Last Review</Text>
                                <Text style={styles.historyDate}>{new Date(page.completedAt!).toLocaleDateString()}</Text>
                            </View>
                        )}
                        <View style={styles.historyRow}>
                            <Text style={styles.historyText}>Next Review</Text>
                            <Text style={styles.historyDate}>{page.nextReviewDate ? new Date(page.nextReviewDate).toLocaleDateString() : 'Not Scheduled'}</Text>
                        </View>
                    </View>

                </ScrollView>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
    content: { backgroundColor: '#1e1e1e', borderRadius: 16, maxHeight: '80%', padding: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: 'bold', color: 'white' },

    statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    statCard: { width: '30%', backgroundColor: '#2c2c2c', padding: 10, borderRadius: 8, alignItems: 'center' },
    statVal: { fontSize: 18, fontWeight: 'bold', color: '#35c128' },
    statLabel: { fontSize: 10, color: '#aaa', marginTop: 4, textAlign: 'center' },

    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: 'white', marginTop: 10, marginBottom: 10 },
    graphContainer: { alignItems: 'center', backgroundColor: '#252525', borderRadius: 12, padding: 10 },

    explanation: { color: '#ccc', fontSize: 12, marginTop: 10, fontStyle: 'italic', textAlign: 'center' },

    historyCard: { backgroundColor: '#2c2c2c', borderRadius: 8, padding: 15 },
    historyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    historyText: { color: '#ccc' },
    historyDate: { color: 'white', fontWeight: 'bold' }
});
